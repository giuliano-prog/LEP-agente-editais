import { decodeEntities } from "./documents";

export type PageLink = { text: string; url: string };

/** Remove fragmento (#...) e parâmetros de rastreamento (utm_*, fbclid...) para comparar URLs. */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

const stripTags = (html: string) =>
  decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/**
 * Todos os links http(s) da página. Links repetidos (ex.: título + "saiba mais"
 * apontando para o mesmo endereço) são agrupados, mantendo o texto mais descritivo.
 */
export function extractLinks(html: string, baseUrl: string, limit = 500): PageLink[] {
  const byUrl = new Map<string, PageLink>();
  const content = html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ");
  for (const match of content.matchAll(
    /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    let url: string;
    try {
      const parsed = new URL(decodeEntities(match[1] ?? "").trim(), baseUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      url = normalizeUrl(parsed.toString());
    } catch {
      continue;
    }
    const inner = match[2] ?? "";
    const title = inner.match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1];
    const text = (stripTags(inner) || decodeEntities(title ?? "")).slice(0, 300);
    const existing = byUrl.get(url);
    if (!existing) {
      if (byUrl.size >= limit) break;
      byUrl.set(url, { url, text });
    } else if (text.length > existing.text.length) {
      existing.text = text;
    }
  }
  return [...byUrl.values()];
}

/** Texto legível da página (sem scripts, menus de navegação e rodapé), para análise por regras. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|nav|footer|header|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Descrição da página (meta description / og:description). */
export function extractDescription(html: string): string | null {
  const meta =
    html.match(
      /<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:og:)?description["']/i,
    )?.[1];
  const text = meta ? decodeEntities(meta).replace(/\s+/g, " ").trim() : "";
  return text.length >= 20 ? text.slice(0, 1000) : null;
}
