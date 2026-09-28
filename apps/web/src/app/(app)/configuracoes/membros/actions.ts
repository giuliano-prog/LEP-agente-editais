"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { UF_NAMES } from "@lep/funding";
import { requireMembership } from "@/lib/auth/session";
import {
  inviteMember,
  inviteRedirectUrl,
  inviteSchema,
  reactivationStatus,
  resendInvite,
} from "@/lib/members/invite";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ProponentState = { error?: string; success?: string };

const schema = z.object({
  hq_state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value in UF_NAMES, { message: "Selecione a UF da sede." }),
  hq_city: z.string().trim().min(2, "Informe o município da sede.").max(120),
});

/** Sede do proponente (diretriz nº 1). Somente administradores. */
export async function updateProponent(
  _prev: ProponentState,
  formData: FormData,
): Promise<ProponentState> {
  const { membership } = await requireMembership("admin");
  const parsed = schema.safeParse({
    hq_state: formData.get("hq_state") ?? "",
    hq_city: formData.get("hq_city") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", membership.orgId);
  if (error) {
    console.error("Erro ao salvar sede:", error.code);
    return {
      error:
        "Não foi possível salvar. Confira se a migração de diretrizes foi aplicada (Diagnóstico).",
    };
  }
  revalidatePath("/", "layout");
  return { success: "Sede atualizada. A aderência dos editais já considera o novo endereço." };
}

// ---------------------------------------------------------------------
// Membros: convite, reenvio, suspensão e reativação (somente administradores)
// ---------------------------------------------------------------------

export type MemberActionState = { error?: string; success?: string; savedAt?: number };

/** URL pública do app (SITE_URL, se definida; senão o endereço desta requisição). */
async function siteUrl(): Promise<string | null> {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}

/** Só depois de confirmar que quem chama é admin a chave de serviço é usada. */
async function adminContext() {
  const session = await requireMembership("admin");
  if (!isAdminClientConfigured()) {
    return {
      session,
      error:
        "SUPABASE_SECRET_KEY não configurada no servidor: convites indisponíveis. Veja o Diagnóstico.",
    } as const;
  }
  const base = await siteUrl();
  if (!base)
    return {
      session,
      error: "Não foi possível determinar o endereço do site (SITE_URL).",
    } as const;
  return { session, admin: createAdminClient(), redirectTo: inviteRedirectUrl(base) } as const;
}

export async function inviteMemberAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const context = await adminContext();
  if ("error" in context) return { error: context.error };
  const parsed = inviteSchema.safeParse({
    email: formData.get("email") ?? "",
    full_name: formData.get("full_name") ?? "",
    role: formData.get("role") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const result = await inviteMember(context.admin, {
    orgId: context.session.membership.orgId,
    actorId: context.session.userId,
    input: parsed.data,
    redirectTo: context.redirectTo,
  });
  revalidatePath("/configuracoes/membros");
  return result.ok ? { success: result.message, savedAt: Date.now() } : { error: result.error };
}

export async function resendInviteAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const context = await adminContext();
  if ("error" in context) return { error: context.error };
  const membershipId = z.uuid().safeParse(formData.get("membership_id"));
  if (!membershipId.success) return { error: "Membro inválido." };

  const result = await resendInvite(context.admin, {
    orgId: context.session.membership.orgId,
    membershipId: membershipId.data,
    redirectTo: context.redirectTo,
  });
  revalidatePath("/configuracoes/membros");
  return result.ok ? { success: result.message } : { error: result.error };
}

/** Suspender/reativar: sessão do próprio admin (RLS + regras do banco), sem chave de serviço. */
export async function setMemberStatusAction(
  _prev: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const { membership } = await requireMembership("admin");
  const membershipId = z.uuid().safeParse(formData.get("membership_id"));
  const intent = formData.get("intent");
  if (!membershipId.success || (intent !== "suspend" && intent !== "reactivate")) {
    return { error: "Ação inválida." };
  }

  const supabase = await createClient();
  const current = await supabase
    .from("memberships")
    .select("status, accepted_at")
    .eq("id", membershipId.data)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (current.error || !current.data) return { error: "Membro não encontrado." };

  const status = intent === "suspend" ? "suspended" : reactivationStatus(current.data.accepted_at);
  const { data, error } = await supabase
    .from("memberships")
    .update({ status })
    .eq("id", membershipId.data)
    .eq("org_id", membership.orgId)
    .select("id");
  if (error) {
    // Regras do banco (próprio acesso, último administrador) chegam com mensagem clara.
    return { error: error.code === "23514" ? error.message : "Não foi possível alterar o acesso." };
  }
  if (!data?.length) return { error: "Sem permissão para alterar este membro." };
  revalidatePath("/configuracoes/membros");
  return {
    success:
      intent === "suspend"
        ? "Acesso suspenso."
        : status === "active"
          ? "Acesso reativado."
          : "Reativado como convite: o acesso é liberado quando a pessoa entrar.",
  };
}
