import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lep/db";
import { removeAvatar, uploadAvatar } from "./avatar";

/** Cliente da sessão (a própria pessoa, RLS) ou admin (ADM, depois de checar papel e organização). */
type ProfileClient = SupabaseClient<Database, "core">;

export type ProfileChange = {
  fullName: string;
  /** Nova foto (já recebida do formulário) ou null para manter a atual. */
  avatar: File | null;
  /** true = voltar para as iniciais. */
  removeAvatar: boolean;
};

const MISSING_MIGRATION =
  "A foto de perfil ainda não está disponível neste banco: aplique a migração 20261010120000 (GitHub → Actions → “Migrações Supabase”).";

/**
 * Salva nome e foto de UM perfil. Sobe a foto nova antes de gravar e só apaga a antiga
 * depois que o perfil aponta para a nova (nunca fica sem foto por erro no meio).
 */
export async function saveProfile(
  client: ProfileClient,
  userId: string,
  change: ProfileChange,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await client
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .maybeSingle();
  const avatarColumn = current.error?.code !== "42703";
  if (!avatarColumn && (change.avatar || change.removeAvatar)) {
    return { ok: false, error: MISSING_MIGRATION };
  }
  if (avatarColumn && (current.error || !current.data)) {
    return { ok: false, error: "Perfil não encontrado." };
  }
  const previous = avatarColumn ? (current.data?.avatar_path ?? null) : null;

  let avatarPath: string | null | undefined; // undefined = não mexe na foto
  if (change.avatar) {
    const uploaded = await uploadAvatar(client, userId, change.avatar);
    if ("error" in uploaded) return { ok: false, error: uploaded.error };
    avatarPath = uploaded.path;
  } else if (change.removeAvatar) {
    avatarPath = null;
  }

  const { data, error } = await client
    .from("profiles")
    .update(
      avatarPath === undefined
        ? { full_name: change.fullName }
        : { full_name: change.fullName, avatar_path: avatarPath },
    )
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) {
    if (avatarPath) await removeAvatar(client, avatarPath);
    console.error("Perfil: falha ao salvar", error?.code ?? "sem linha atualizada");
    return { ok: false, error: "Não foi possível salvar o perfil. Tente novamente." };
  }
  if (avatarPath !== undefined && previous && previous !== avatarPath) {
    await removeAvatar(client, previous);
  }
  return { ok: true };
}
