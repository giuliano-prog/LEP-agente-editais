import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET, avatarObjectPath, checkAvatar } from "./avatar-rules";

/** Cliente da sessão (RLS: só a própria pasta) ou cliente admin (ADM, após checar o papel). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- os dois clientes têm tipos de schema diferentes
type StorageClient = Pick<SupabaseClient<any, any, any>, "storage">;

const SIGNED_URL_SECONDS = 60 * 60;

/**
 * Valida e envia a foto para `avatars/<userId>/...`. Devolve o caminho a gravar em
 * `profiles.avatar_path`. Não grava imagem no banco e não registra dados pessoais em log.
 */
export async function uploadAvatar(
  client: StorageClient,
  userId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkAvatar(bytes.byteLength, bytes.subarray(0, 16));
  if (!check.ok) return { error: check.error };
  const path = avatarObjectPath(userId, check.extension);
  const { error } = await client.storage.from(AVATAR_BUCKET).upload(path, bytes, {
    contentType: check.contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    console.error("Foto de perfil: falha no envio ao Storage", error.name ?? "sem código");
    return {
      error:
        "Não foi possível salvar a foto. Confira no Diagnóstico se a migração 20261010120000 (fotos de perfil) foi aplicada.",
    };
  }
  return { path };
}

/** Remove fotos antigas (falha silenciosa: a foto nova já está gravada). */
export async function removeAvatar(client: StorageClient, path: string | null | undefined) {
  if (!path) return;
  await client.storage.from(AVATAR_BUCKET).remove([path]);
}

/** URLs assinadas (bucket privado) para exibir fotos. Caminhos sem URL ficam sem foto (iniciais). */
export async function signedAvatarUrls(
  client: StorageClient,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (unique.length === 0) return new Map();
  const { data, error } = await client.storage
    .from(AVATAR_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error || !data) return new Map();
  const urls = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}
