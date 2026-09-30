/**
 * Regras da foto de perfil (sem dependências de servidor, para testes).
 * Os mesmos limites estão no bucket `avatars` (migração 20261010120000): a validação
 * aqui dá a mensagem certa na tela; o Storage recusa de novo se algo escapar.
 */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type AvatarType = keyof typeof TYPES;

export type AvatarCheck =
  { ok: true; contentType: AvatarType; extension: string } | { ok: false; error: string };

/** Tipo real pelo conteúdo (assinatura do arquivo), não pelo nome ou pelo tipo declarado. */
export function sniffImageType(bytes: Uint8Array): AvatarType | null {
  const at = (index: number) => bytes[index];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => at(i) === value)) {
    return "image/png";
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Valida tamanho e tipo da foto enviada. */
export function checkAvatar(size: number, head: Uint8Array): AvatarCheck {
  if (size === 0) return { ok: false, error: "O arquivo da foto está vazio." };
  if (size > AVATAR_MAX_BYTES) return { ok: false, error: "A foto deve ter no máximo 2 MB." };
  const contentType = sniffImageType(head);
  if (!contentType) return { ok: false, error: "Use uma foto JPG, PNG ou WebP." };
  return { ok: true, contentType, extension: TYPES[contentType] };
}

/** Caminho no bucket: sempre dentro da pasta da própria pessoa (regra também no banco). */
export function avatarObjectPath(userId: string, extension: string, now = Date.now()): string {
  return `${userId}/${now}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
}

/** Arquivo realmente enviado num campo de formulário (input vazio vira File de tamanho 0). */
export function uploadedFile(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}
