"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMembership } from "@/lib/auth/session";
import { executeProposal, parseProposal, validateProposal } from "@/lib/assistant/proposals";
import {
  advanceRun,
  AssistantRunError,
  cancelRun,
  startRun,
  type RunView,
} from "@/lib/assistant/run";
import { createSupabaseAssistantStore } from "@/lib/assistant/supabase-store";
import { createClient } from "@/lib/supabase/server";

/**
 * Server actions do Assistente LEP (ADR-0027). Só Diretoria/ADM (editor+) acionam o agente;
 * a chave da Anthropic fica no servidor (nada daqui devolve segredo ou transcrição ao
 * navegador — só o estado da execução).
 */

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const UUID = z.string().uuid();

export type AssistantActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const pagePath = (editalId: string) => `/editais/${editalId}/trabalho`;
const ANCHOR = /^[a-z0-9-]{1,80}$/i;

async function scopeOf(editalId: string) {
  if (!ID_PATTERN.test(editalId)) throw new AssistantRunError("Edital inválido.");
  const session = await requireMembership("editor");
  const supabase = await createClient();
  const { data } = await supabase
    .from("edital_workspaces")
    .select("id")
    .eq("edital_id", editalId)
    .eq("org_id", session.membership.orgId)
    .maybeSingle();
  if (!data) throw new AssistantRunError("Crie a Área de Trabalho antes de usar o Assistente.");
  return {
    session,
    scope: {
      supabase,
      orgId: session.membership.orgId,
      userId: session.userId,
      workspaceId: data.id,
      editalId,
    },
  };
}

async function guarded<T>(work: () => Promise<T>): Promise<AssistantActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    // redirect()/notFound() do Next precisam continuar propagando.
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (error instanceof AssistantRunError) return { ok: false, error: error.message };
    console.error("Assistente: erro inesperado:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Erro inesperado no Assistente. Tente novamente." };
  }
}

const StartInput = z.object({
  kind: z.enum(["chat", "full_analysis"]),
  request: z.string().max(8000).nullable(),
});

export async function startAssistantRun(
  editalId: string,
  input: { kind: "chat" | "full_analysis"; request: string | null },
): Promise<AssistantActionResult<RunView>> {
  return guarded(async () => {
    const parsed = StartInput.safeParse(input);
    if (!parsed.success) throw new AssistantRunError("Pedido inválido.");
    const { session, scope } = await scopeOf(editalId);
    return startRun(
      { ...scope, requesterName: session.fullName ?? session.email ?? null },
      parsed.data,
    );
  });
}

export async function advanceAssistantRun(
  editalId: string,
  runId: string,
): Promise<AssistantActionResult<RunView>> {
  return guarded(async () => {
    if (!UUID.safeParse(runId).success) throw new AssistantRunError("Execução inválida.");
    const { scope } = await scopeOf(editalId);
    return advanceRun(scope, runId);
  });
}

export async function cancelAssistantRun(
  editalId: string,
  runId: string,
): Promise<AssistantActionResult<null>> {
  return guarded(async () => {
    if (!UUID.safeParse(runId).success) throw new AssistantRunError("Execução inválida.");
    const { scope } = await scopeOf(editalId);
    await cancelRun(scope, runId);
    revalidatePath(pagePath(editalId));
    return null;
  });
}

/**
 * Aprova ou recusa uma ação que o Assistente PROPÔS. A execução é feita por código
 * determinístico (proposals.ts), revalidando o estado atual — nunca pelo modelo.
 */
export async function decideProposal(
  editalId: string,
  actionId: string,
  decision: "approve" | "decline",
): Promise<AssistantActionResult<string>> {
  return guarded(async () => {
    if (!UUID.safeParse(actionId).success) throw new AssistantRunError("Proposta inválida.");
    if (decision !== "approve" && decision !== "decline")
      throw new AssistantRunError("Decisão inválida.");
    const { scope } = await scopeOf(editalId);
    const { supabase, orgId, workspaceId } = scope;

    const { data: action } = await supabase
      .from("agent_actions")
      .select("id, run_id, status, summary, proposal")
      .eq("id", actionId)
      .eq("org_id", orgId)
      .eq("workspace_id", workspaceId)
      .eq("kind", "proposal")
      .maybeSingle();
    if (!action) throw new AssistantRunError("Proposta não encontrada.");
    if (action.status !== "pending_confirmation")
      throw new AssistantRunError("Esta proposta já foi decidida.");

    const proposal = parseProposal(action.proposal);
    const store = createSupabaseAssistantStore({ ...scope, runId: null, step: 0 });

    let outcome: string;
    if (decision === "approve") {
      if (!proposal) throw new AssistantRunError("Proposta sem ação válida; recuse-a.");
      // Revalida antes de reservar a decisão (o estado pode ter mudado desde a proposta).
      try {
        await validateProposal(store, proposal);
      } catch (error) {
        throw new AssistantRunError(
          `Não dá para aprovar agora: ${error instanceof Error ? error.message : "estado mudou"}`,
        );
      }
    }

    // Reserva a decisão (só pendente → decidida; o gatilho registra quem e quando).
    const claimed = await supabase
      .from("agent_actions")
      .update({ status: decision === "approve" ? "approved" : "declined" })
      .eq("id", actionId)
      .eq("org_id", orgId)
      .eq("status", "pending_confirmation")
      .select("id")
      .maybeSingle();
    if (!claimed.data) throw new AssistantRunError("Esta proposta já foi decidida.");

    if (decision === "approve" && proposal) {
      try {
        outcome = await executeProposal(store, proposal);
      } catch (error) {
        outcome = `Aprovada, mas não foi possível executar: ${error instanceof Error ? error.message : "erro"}`;
      }
    } else {
      outcome = `Proposta recusada: ${action.summary}`;
    }

    const conversation = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (conversation.data) {
      await supabase.from("assistant_messages").insert({
        org_id: orgId,
        conversation_id: conversation.data.id,
        run_id: action.run_id,
        role: "notice",
        content: outcome.slice(0, 2000),
        author_id: scope.userId,
        metadata: { proposal_id: actionId, decision },
      });
    }
    revalidatePath(pagePath(editalId));
    return outcome;
  });
}

function back(editalId: string, params: Record<string, string>, anchor?: string): never {
  const query = new URLSearchParams(params).toString();
  redirect(`${pagePath(editalId)}${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`);
}

/** A pessoa aplica (ou descarta) a sugestão de texto que a IA deixou num item. */
export async function decideSuggestion(
  editalId: string,
  itemId: string,
  decision: "apply" | "discard",
  anchor: string,
): Promise<void> {
  if (!ID_PATTERN.test(editalId) || !UUID.safeParse(itemId).success) redirect("/editais");
  const safeAnchor = ANCHOR.test(anchor) ? anchor : undefined;
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("edital_workspace_items")
    .select("id, ai_suggestion")
    .eq("id", itemId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!item?.ai_suggestion) back(editalId, { erro: "Sugestão não encontrada." }, safeAnchor);
  const { error } = await supabase
    .from("edital_workspace_items")
    .update(
      decision === "apply"
        ? {
            content: item.ai_suggestion,
            ai_suggestion: null,
            ai_suggestion_at: null,
            updated_via: "user",
          }
        : { ai_suggestion: null, ai_suggestion_at: null, updated_via: "user" },
    )
    .eq("id", itemId)
    .eq("org_id", membership.orgId);
  if (error) {
    console.error("Erro ao decidir sugestão:", error.code, error.message);
    back(editalId, { erro: "Não foi possível salvar." }, safeAnchor);
  }
  revalidatePath(pagePath(editalId));
  back(
    editalId,
    { ok: decision === "apply" ? "Sugestão aplicada ao texto." : "Sugestão descartada." },
    safeAnchor,
  );
}

/** A equipe resolve, descarta ou reabre um achado (inconsistência, risco, decisão...). */
export async function setFindingStatus(
  editalId: string,
  findingId: string,
  status: "open" | "resolved" | "dismissed",
  formData: FormData,
): Promise<void> {
  if (!ID_PATTERN.test(editalId) || !UUID.safeParse(findingId).success) redirect("/editais");
  if (!["open", "resolved", "dismissed"].includes(status))
    back(editalId, { erro: "Situação inválida." });
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();
  const note = String(formData.get("resolution") ?? "")
    .trim()
    .slice(0, 2000);
  const { error } = await supabase
    .from("workspace_findings")
    .update({ status, resolution: status === "open" ? null : note || null })
    .eq("id", findingId)
    .eq("org_id", membership.orgId);
  if (error) {
    console.error("Erro ao atualizar achado:", error.code, error.message);
    back(editalId, { erro: "Não foi possível atualizar o achado." }, "inconsistencias");
  }
  revalidatePath(pagePath(editalId));
  back(
    editalId,
    {
      ok:
        status === "resolved"
          ? "Achado marcado como resolvido."
          : status === "dismissed"
            ? "Achado descartado."
            : "Achado reaberto.",
    },
    ANCHOR.test(String(formData.get("anchor") ?? ""))
      ? String(formData.get("anchor"))
      : "inconsistencias",
  );
}
