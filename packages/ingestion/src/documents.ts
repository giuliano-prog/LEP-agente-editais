import { createHash } from "node:crypto";

export type DocumentKind = "pdf" | "html";

export function sha256(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Confere pela assinatura do arquivo (não pela extensão ou cabeçalho). */
export function isPdf(data: Buffer | Uint8Array): boolean {
  const head = Buffer.from(data.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

export function detectKind(contentType: string, body: Buffer): DocumentKind | null {
  if (isPdf(body)) return "pdf";
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml"))
    return "html";
  const start = body.subarray(0, 512).toString("latin1").trimStart().toLowerCase();
  if (start.startsWith("<!doctype html") || start.startsWith("<html")) return "html";
  return null;
}

function charsetOf(contentType: string, body: Buffer): string {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  const head = body.subarray(0, 4096).toString("latin1");
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  return (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
}

export function decodeHtml(contentType: string, body: Buffer): string {
  try {
    return new TextDecoder(charsetOf(contentType, body)).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

// Letras acentuadas do português: &aacute; &Atilde; &ccedil; ...
const ACCENTS: Record<string, string> = {
  acute: "\u0301",
  grave: "\u0300",
  circ: "\u0302",
  tilde: "\u0303",
  uml: "\u0308",
  cedil: "\u0327",
};

function namedEntity(name: string): string | undefined {
  if (ENTITIES[name]) return ENTITIES[name];
  const accent = name.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil)$/);
  if (accent?.[1] && accent[2]) return (accent[1] + ACCENTS[accent[2]]).normalize("NFC");
  return undefined;
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X"))
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return namedEntity(entity) ?? match;
  });
}

const clean = (text: string) =>
  decodeEntities(text.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

export type HtmlMetadata = {
  title: string | null;
  pdfLinks: { label: string; url: string }[];
};

/** Extrai título e links para PDFs de uma página (metadados simples, sem executar scripts). */
export function extractHtmlMetadata(html: string, baseUrl: string): HtmlMetadata {
  const ogTitle = html.match(
    /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
  )?.[1];
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = clean(ogTitle ?? titleTag ?? "") || null;

  const seen = new Set<string>();
  const pdfLinks: HtmlMetadata["pdfLinks"] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(match[1] ?? "");
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    if (!/\.pdf($|\?)/i.test(url.pathname + url.search)) continue;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    const label =
      clean(match[2] ?? "") || decodeURIComponent(url.pathname.split("/").pop() ?? "PDF");
    pdfLinks.push({ label: label.slice(0, 200), url: key });
    if (pdfLinks.length >= 50) break;
  }
  return { title, pdfLinks };
}

/** Título legível a partir do nome do arquivo ("edital_n7-2026.pdf" → "edital n7 2026"). */
export function titleFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base.slice(0, 200) || "Edital sem título";
}
