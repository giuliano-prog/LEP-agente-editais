import "server-only";

import { resolveAssistantConfig } from "@lep/ai";
import type { PanelMessage, PanelProposal } from "@/components/workspace/assistant-panel";
import type { createClient } from "@/lib/supabase/server";
import { RUN_COLUMNS, toRunView, type RunRow, type RunView } from "./run-view";
import type { FindingRow } from "./store";
import type { RunSummary } from "./summary";
import { toFinding } from "./supabase-store";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AssistantPanelData = {
  /** `false` quando as tabelas do Assistente ainda não existem (migração pendente). */
  available: boolean;
  error: { code?: string; message?: string } | null;
  configured: boolean;
  notConfiguredReason: string | null;
  model: string;
  messages: PanelMessage[];
  activeRun: RunView | null;
  lastRun: RunView | null;
  proposals: PanelProposal[];
  findings: FindingRow[];
};

const MESSAGE_LIMIT = 80;

/**
 * Dados do painel ASSISTENTE LEP. Só LÊ o banco: abrir a página nunca aciona a IA (custo
 * zero no render). A chave da Anthropic não sai daqui — só "configurado: sim/não".
 */
export async function loadAssistantPanel(
  supabase: Supabase,
  orgId: string,
  workspaceId: string,
  isAdmin: boolean,
): Promise<AssistantPanelData> {
  const config = resolveAssistantConfig();
  const base: AssistantPanelData = {
    available: true,
    error: null,
    configured: config.configured,
    notConfiguredReason: config.configured
      ? null
      : isAdmin
        ? config.reason
        : "a IA ainda não foi configurada no servidor (fale com o ADM).",
    model: config.model,
    messages: [],
    activeRun: null,
    lastRun: null,
    proposals: [],
    findings: [],
  };

  const [conversation, runs, proposals, findings] = await Promise.all([
    supabase
      .from("assistant_conversations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("agent_runs")
      .select(RUN_COLUMNS)
      .eq("workspace_id", workspaceId)
      .eq("org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(1),
    supabase
      .from("agent_actions")
      .select("id, summary, proposal, created_at")
      .eq("workspace_id", workspaceId)
      .eq("org_id", orgId)
      .eq("kind", "proposal")
      .eq("status", "pending_confirmation")
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("workspace_findings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  const failure = conversation.error ?? runs.error ?? findings.error;
  if (failure) return { ...base, available: false, error: failure };

  const latest = (runs.data ?? [])[0] as RunRow | undefined;
  const latestView = latest ? toRunView(latest) : null;
  const active = latestView && (latestView.status === "queued" || latestView.status === "running");

  let messages: PanelMessage[] = [];
  if (conversation.data) {
    const { data } = await supabase
      .from("assistant_messages")
      .select(
        "id, role, content, created_at, metadata, author_id, profiles:author_id ( full_name, email )",
      )
      .eq("conversation_id", conversation.data.id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_LIMIT);
    messages = (data ?? []).reverse().map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const metadata = (
        row.metadata && typeof row.metadata === "object" ? row.metadata : {}
      ) as Record<string, unknown>;
      const summary = metadata.summary as RunSummary | undefined;
      return {
        id: row.id,
        role: row.role === "assistant" ? "assistant" : row.role === "notice" ? "notice" : "user",
        content: row.content,
        authorName: profile?.full_name ?? profile?.email ?? null,
        createdAt: row.created_at,
        status: typeof metadata.status === "string" ? metadata.status : null,
        summary: summary && Array.isArray(summary.entries) ? summary : null,
      };
    });
  }

  return {
    ...base,
    messages,
    activeRun: active ? latestView : null,
    lastRun: active ? null : latestView,
    proposals: (proposals.data ?? []).map((row) => {
      const proposal = (
        row.proposal && typeof row.proposal === "object" ? row.proposal : {}
      ) as Record<string, unknown>;
      return {
        id: row.id,
        summary:
          row.summary ??
          (typeof proposal.descricao === "string" ? proposal.descricao : "Ação proposta"),
        reason: typeof proposal.motivo === "string" ? proposal.motivo : null,
        createdAt: row.created_at,
      };
    }),
    findings: (findings.data ?? []).map((row) => toFinding(row as Record<string, unknown>)),
  };
}
