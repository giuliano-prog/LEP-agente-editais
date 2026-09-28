import "server-only";

import { z } from "zod";
import { MEMBERSHIP_STATUS_LABELS, ROLES, isMembershipStatus } from "@lep/core";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Convites de membros (etapa 3). Usa a chave de serviço SOMENTE depois que a
 * ação verificou que quem chama é administrador da organização (requireMembership("admin")),
 * e sempre filtra pela organização desse administrador.
 * A plataforma nunca pede nem guarda senhas: a pessoa define a própria senha no
 * link do Supabase Auth. E-mails não vão para os logs (dados sigilosos).
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "E-mail longo demais.")
    .pipe(z.email("Informe um e-mail válido.")),
  full_name: z
    .string()
    .trim()
    .max(120, "Nome longo demais.")
    .transform((value) => value || undefined),
  role: z.enum(ROLES, { message: "Selecione o perfil." }),
});

export type InviteInput = z.infer<typeof inviteSchema>;

export type MemberResult = { ok: true; message: string } | { ok: false; error: string };

/** Destino do link do convite: a página onde a própria pessoa define a senha. */
export function inviteRedirectUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/conta/senha`;
}

type AuthErrorLike = { status?: number; code?: string; message?: string } | null | undefined;

/** Traduz erros do Supabase Auth em causa + correção (sem expor dados). */
export function describeAuthError(error: AuthErrorLike): string {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "over_email_send_rate_limit" || error?.status === 429) {
    return "Limite de envio de e-mails do Supabase atingido. Aguarde alguns minutos; para uso contínuo, configure um SMTP próprio (Supabase → Authentication → Emails → SMTP Settings).";
  }
  if (code === "email_exists" || code === "user_already_exists" || error?.status === 422) {
    return "Já existe uma conta confirmada com este e-mail: o acesso é liberado no próximo login da pessoa.";
  }
  if (code === "email_address_invalid" || code === "validation_failed") {
    return "O Supabase recusou este e-mail. Confira o endereço.";
  }
  if (message.includes("sending") || message.includes("smtp") || code === "unexpected_failure") {
    return "O Supabase não conseguiu enviar o e-mail do convite. Confira o SMTP (Supabase → Authentication → Emails → SMTP Settings) e o modelo “Invite user”.";
  }
  if (code === "not_admin" || error?.status === 401 || error?.status === 403) {
    return "A chave de serviço não tem permissão para convidar. Confira SUPABASE_SECRET_KEY no Diagnóstico.";
  }
  return `Não foi possível enviar o convite${code ? ` (código ${code})` : ""}. Veja o Diagnóstico.`;
}

/** Cria o convite: conta no Supabase Auth (se ainda não existir) + vínculo "convidado". */
export async function inviteMember(
  admin: AdminClient,
  params: { orgId: string; actorId: string; input: InviteInput; redirectTo: string },
): Promise<MemberResult> {
  const { orgId, actorId, input, redirectTo } = params;

  const profile = await admin.from("profiles").select("id").eq("email", input.email).maybeSingle();
  if (profile.error) return { ok: false, error: "Não foi possível consultar os usuários." };

  let userId = profile.data?.id ?? null;
  let sentEmail = false;
  if (userId) {
    const existing = await admin
      .from("memberships")
      .select("status")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing.error) return { ok: false, error: "Não foi possível consultar os membros." };
    if (existing.data) {
      const status = isMembershipStatus(existing.data.status)
        ? MEMBERSHIP_STATUS_LABELS[existing.data.status].toLowerCase()
        : existing.data.status;
      return { ok: false, error: `Essa pessoa já está na lista de membros (status: ${status}).` };
    }
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
      data: input.full_name ? { full_name: input.full_name } : undefined,
      redirectTo,
    });
    if (error || !data.user) {
      console.error(
        "Convite: falha no Supabase Auth",
        error?.code ?? error?.status ?? "sem código",
      );
      return { ok: false, error: describeAuthError(error) };
    }
    userId = data.user.id;
    sentEmail = true;
  }

  const { error } = await admin.from("memberships").insert({
    org_id: orgId,
    user_id: userId,
    role: input.role,
    status: "invited",
    invited_by: actorId,
  });
  if (error) {
    console.error("Convite: falha ao gravar vínculo", error.code);
    return {
      ok: false,
      error: sentEmail
        ? "O e-mail foi enviado, mas o vínculo não foi gravado. Tente convidar de novo (não gera conta duplicada)."
        : "Não foi possível gravar o vínculo. Confira no Diagnóstico se a migração de membros foi aplicada.",
    };
  }
  return {
    ok: true,
    message: sentEmail
      ? "Convite enviado. O acesso é liberado quando a pessoa abrir o link e definir a senha."
      : "Essa pessoa já tem conta na plataforma: o acesso é liberado no próximo login dela (nenhum e-mail enviado).",
  };
}

/** Reenvia o e-mail de um convite ainda não aceito. */
export async function resendInvite(
  admin: AdminClient,
  params: { orgId: string; membershipId: string; redirectTo: string },
): Promise<MemberResult> {
  const { orgId, membershipId, redirectTo } = params;
  const membership = await admin
    .from("memberships")
    .select("id, status, user_id, profiles!memberships_user_id_fkey ( email )")
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (membership.error || !membership.data) return { ok: false, error: "Membro não encontrado." };
  if (membership.data.status !== "invited") {
    return { ok: false, error: "Só é possível reenviar convites ainda não aceitos." };
  }
  const email = membership.data.profiles?.email;
  if (!email) return { ok: false, error: "Membro sem e-mail cadastrado." };

  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    console.error("Reenvio de convite: falha no Supabase Auth", error.code ?? error.status);
    return { ok: false, error: describeAuthError(error) };
  }
  await admin
    .from("memberships")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("org_id", orgId);
  return { ok: true, message: "Convite reenviado." };
}

/** Status para reativar: quem nunca entrou volta a ser convite (regra também no banco). */
export function reactivationStatus(acceptedAt: string | null): "active" | "invited" {
  return acceptedAt ? "active" : "invited";
}
