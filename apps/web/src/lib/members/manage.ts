import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABELS, type Role } from "@lep/core";
import type { Database } from "@lep/db";
import { AVATAR_BUCKET } from "@/lib/profile/avatar-rules";

/**
 * Ações do ADM sobre membros existentes: trocar o perfil de acesso e excluir.
 *
 * - `session`: cliente com a sessão do ADM (RLS `memberships_*_admins` + gatilhos do banco:
 *   "pelo menos um administrador ativo"; a auditoria registra quem fez).
 * - `admin`: chave de serviço, SÓ para o que a sessão não pode fazer (ver vínculos em outras
 *   organizações, apagar a conta no Supabase Auth e a foto). Sempre após `requireMembership("admin")`.
 */
type Client = SupabaseClient<Database, "core">;

export const DELETE_CONFIRMATION = "EXCLUIR";

export type ManageResult = { ok: true; message: string } | { ok: false; error: string };

/** Troca o perfil (ADM/Diretoria/Equipe) de um membro da organização — nunca o próprio. */
export async function changeMemberRole(
  session: Client,
  params: { orgId: string; actorId: string; userId: string; role: Role },
): Promise<ManageResult> {
  const { orgId, actorId, userId, role } = params;
  if (userId === actorId) {
    return { ok: false, error: "Você não pode alterar o próprio perfil de acesso." };
  }
  const { data, error } = await session
    .from("memberships")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .select("id");
  if (error) {
    // 23514: regra do banco (a organização precisa manter um administrador ativo).
    return {
      ok: false,
      error: error.code === "23514" ? error.message : "Não foi possível alterar o perfil.",
    };
  }
  if (!data?.length) return { ok: false, error: "Sem permissão para alterar este membro." };
  return { ok: true, message: `Perfil alterado para ${ROLE_LABELS[role]}.` };
}

/**
 * Exclui o usuário da organização e, se ele não tiver vínculo com nenhuma outra, apaga a
 * conta no Supabase Auth (o perfil some em cascata; autoria em editais/histórico vira nula
 * e a auditoria mantém o id). Regras:
 * - ninguém exclui o próprio usuário;
 * - não exclui o último administrador ativo (a exclusão em cascata do Auth não passa pela
 *   trava do banco, por isso a checagem é feita aqui ANTES, e o vínculo é removido primeiro
 *   pela sessão, onde a trava do banco também vale).
 */
export async function removeMember(
  session: Client,
  admin: Client,
  params: { orgId: string; actorId: string; userId: string; confirmation: string },
): Promise<ManageResult> {
  const { orgId, actorId, userId, confirmation } = params;
  if (confirmation.trim().toUpperCase() !== DELETE_CONFIRMATION) {
    return { ok: false, error: `Digite ${DELETE_CONFIRMATION} para confirmar a exclusão.` };
  }
  if (userId === actorId) return { ok: false, error: "Você não pode excluir o próprio usuário." };

  const membership = await session
    .from("memberships")
    .select("id, role, status")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership.error || !membership.data) {
    return { ok: false, error: "Membro não encontrado nesta organização." };
  }
  if (membership.data.role === "admin" && membership.data.status === "active") {
    const others = await session
      .from("memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("role", "admin")
      .eq("status", "active")
      .neq("user_id", userId)
      .limit(1);
    if (others.error || !others.data?.length) {
      return {
        ok: false,
        error: "A organização precisa manter pelo menos um administrador ativo.",
      };
    }
  }

  const removed = await session
    .from("memberships")
    .delete()
    .eq("id", membership.data.id)
    .eq("org_id", orgId)
    .select("id");
  if (removed.error || !removed.data?.length) {
    return {
      ok: false,
      error:
        removed.error?.code === "23514"
          ? removed.error.message
          : "Não foi possível remover o acesso deste membro.",
    };
  }

  // Vínculo com outra organização: a conta continua (só o acesso a esta foi removido).
  const elsewhere = await admin.from("memberships").select("id").eq("user_id", userId).limit(1);
  if (elsewhere.error) {
    return {
      ok: true,
      message:
        "Acesso removido. Não foi possível confirmar se a conta tem outros vínculos: a conta de login foi mantida.",
    };
  }
  if (elsewhere.data?.length) {
    return {
      ok: true,
      message: "Acesso removido desta organização. A conta continua em outra organização.",
    };
  }

  // Foto de perfil (melhor esforço) e conta no Supabase Auth.
  const photos = await admin.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
  if (!photos.error && photos.data?.length) {
    await admin.storage
      .from(AVATAR_BUCKET)
      .remove(photos.data.map((file) => `${userId}/${file.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("Exclusão de membro: falha no Supabase Auth", error.code ?? error.status);
    return {
      ok: true,
      message:
        "Acesso removido, mas a conta de login não pôde ser apagada no Supabase Auth (ela não dá acesso a nada). Se necessário, remova em Supabase → Authentication → Users.",
    };
  }
  return { ok: true, message: "Usuário excluído permanentemente." };
}
