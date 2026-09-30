import "server-only";

import { z } from "zod";
import { MEMBERSHIP_STATUS_LABELS, ROLES, isMembershipStatus } from "@lep/core";
import { passwordSchema } from "@/lib/auth/password";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Criação DIRETA de membro pelo ADM (sem e-mail de convite / SMTP).
 *
 * - Roda só no servidor, com a chave de serviço, DEPOIS de `requireMembership("admin")`
 *   e sempre na organização desse ADM (ADR-0015).
 * - A senha inicial vai direto para o Supabase Auth (`auth.admin.createUser`): não é
 *   gravada em tabela própria, não é devolvida à tela e nunca entra em log.
 * - Conta já existente com o mesmo e-mail NÃO é alterada (nenhuma senha é trocada).
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export const memberNameSchema = z
  .string()
  .trim()
  .min(2, "Informe o nome.")
  .max(120, "Nome longo demais.");

export const createMemberSchema = z.object({
  full_name: memberNameSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "E-mail longo demais.")
    .pipe(z.email("Informe um e-mail válido.")),
  role: z.enum(ROLES, { message: "Selecione o perfil." }),
  password: passwordSchema,
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export type CreateMemberResult = { ok: true; userId: string } | { ok: false; error: string };

type AuthErrorLike = { status?: number; code?: string } | null | undefined;

/** Erros do Supabase Auth na criação, com causa e correção (sem expor dados). */
export function describeCreateError(error: AuthErrorLike): string {
  const code = error?.code ?? "";
  if (code === "email_exists" || code === "user_already_exists" || error?.status === 422) {
    return "Já existe uma conta com este e-mail. Nenhuma senha foi alterada.";
  }
  if (code === "weak_password") {
    return "O Supabase recusou a senha inicial (fraca demais). Use uma senha mais forte.";
  }
  if (code === "email_address_invalid" || code === "validation_failed") {
    return "O Supabase recusou este e-mail. Confira o endereço.";
  }
  if (code === "not_admin" || error?.status === 401 || error?.status === 403) {
    return "A chave de serviço não tem permissão para criar usuários. Confira SUPABASE_SECRET_KEY no Diagnóstico.";
  }
  return `Não foi possível criar o acesso${code ? ` (código ${code})` : ""}. Veja o Diagnóstico.`;
}

/** Cria a conta no Supabase Auth (e-mail já confirmado) + vínculo ATIVO na organização. */
export async function createMemberDirect(
  admin: AdminClient,
  params: { orgId: string; actorId: string; input: CreateMemberInput },
): Promise<CreateMemberResult> {
  const { orgId, actorId, input } = params;

  const profile = await admin.from("profiles").select("id").eq("email", input.email).maybeSingle();
  if (profile.error) return { ok: false, error: "Não foi possível consultar os usuários." };
  if (profile.data) {
    const existing = await admin
      .from("memberships")
      .select("status")
      .eq("org_id", orgId)
      .eq("user_id", profile.data.id)
      .maybeSingle();
    if (existing.data) {
      const status = isMembershipStatus(existing.data.status)
        ? MEMBERSHIP_STATUS_LABELS[existing.data.status].toLowerCase()
        : existing.data.status;
      return {
        ok: false,
        error: `Essa pessoa já está na lista de membros (status: ${status}). Para completar nome e foto, use “Editar” na lista.`,
      };
    }
    return { ok: false, error: describeCreateError({ code: "email_exists" }) };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
  });
  if (error || !data.user) {
    console.error(
      "Criação de membro: falha no Supabase Auth",
      error?.code ?? error?.status ?? "sem código",
    );
    return { ok: false, error: describeCreateError(error) };
  }
  const userId = data.user.id;

  // O gatilho core.handle_new_user já cria o perfil com o nome; garante mesmo assim.
  await admin.from("profiles").update({ full_name: input.full_name }).eq("id", userId);

  const membership = await admin.from("memberships").insert({
    org_id: orgId,
    user_id: userId,
    role: input.role,
    status: "active",
    invited_by: actorId,
  });
  if (membership.error) {
    console.error("Criação de membro: falha ao gravar vínculo", membership.error.code);
    // Desfaz a conta para não deixar usuário sem vínculo (e permitir tentar de novo).
    await admin.auth.admin.deleteUser(userId);
    return {
      ok: false,
      error:
        "Não foi possível gravar o vínculo com a organização; a conta foi desfeita. Confira o Diagnóstico e tente de novo.",
    };
  }
  return { ok: true, userId };
}

/** O membro pertence à organização do ADM? (edição de nome/foto de outra pessoa). */
export async function isMemberOfOrg(
  admin: AdminClient,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data);
}
