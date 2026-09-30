/**
 * Links externos exibidos na interface (edital oficial, fonte). Só http(s) — nunca
 * `javascript:` ou outros esquemas vindos de dados importados.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Endereço comparável de uma fonte: sem www, sem barra final, sem #fragmento. */
export function sourceKey(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "";
    return `${host}${path}${url.search}`;
  } catch {
    return null;
  }
}

/** Fonte já cadastrada com o mesmo endereço (variações de www/barra final contam como iguais). */
export function findSameSource<T extends { list_url: string }>(
  sources: T[],
  candidate: string,
): T | null {
  const key = sourceKey(candidate);
  if (!key) return null;
  return sources.find((source) => sourceKey(source.list_url) === key) ?? null;
}
