/**
 * Regras da varredura automática de fontes (sem IA).
 * Objetivo: achar links que parecem editais de audiovisual e sugerir prazo/valor.
 * Tudo que é importado entra como "revisão pendente" (ADR-0009).
 */

export type SourceConfig = {
  listUrl: string;
  /** Todas as oportunidades da fonte são de audiovisual (ex.: Spcine, RioFilme). */
  audiovisualOnly: boolean;
  /** Trecho obrigatório no endereço do link (ex.: "/editais/"), opcional. */
  linkContains: string | null;
};

export type Candidate = { title: string; url: string };

const EDITAL_TERMS =
  /\b(edita(l|is)|chamada|chamamento|sele[cç][aã]o|concurso|pr[eê]mio|fomento|credenciamento|programa|linha|inscri[cç](ão|ões|oes|ao))\b/i;
const AUDIOVISUAL_TERMS =
  /\b(audiovisua(l|is)|cinema(s|tográfic\w*)?|film(e|es)|longa|curta|m[eé]dia-metragem|s[eé]ries?|document[aá]rio|anima[cç](ão|ões|ao)|roteiro|fsa|ancine|obra(s)? audiovisua\w+|tv|televis\w+|streaming|festiva(l|is)|cineclub\w*|distribui[cç]\w+|produ[cç](ão|ões) audiovisua\w+)\b/i;
/** Links que são sobre editais mas não são uma oportunidade nova. */
const NOISE =
  /^(resultado|homologa|errata|retifica|ata\b|anexo|perguntas|d[uú]vidas|faq|todos os|ver (todos|mais)|leia mais|saiba mais|voltar|pr[oó]xim|anterior|p[aá]gina|login|entrar|cadastre)/i;

const slug = (url: URL) => decodeURIComponent(url.pathname).replace(/[-_/]+/g, " ");

/** Seleciona, na ordem da página, os links que parecem editais de audiovisual. */
export function selectCandidates(
  links: { text: string; url: string }[],
  source: SourceConfig,
  knownUrls: Set<string>,
  limit = 10,
): Candidate[] {
  const listUrl = new URL(source.listUrl);
  const result: Candidate[] = [];

  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      continue;
    }
    const isPdf = /\.pdf$/i.test(url.pathname);
    const sameSite = url.hostname.replace(/^www\./, "") === listUrl.hostname.replace(/^www\./, "");
    if (!sameSite && !isPdf) continue;
    if (
      url.toString() === listUrl.toString() ||
      url.pathname === "/" ||
      knownUrls.has(url.toString())
    )
      continue;
    if (
      source.linkContains &&
      !url.toString().toLowerCase().includes(source.linkContains.toLowerCase())
    )
      continue;

    const title = link.text.trim();
    const described = `${title} ${slug(url)}`;
    if (title.length < 10 || NOISE.test(title)) continue;
    if (!EDITAL_TERMS.test(described)) continue;
    if (!source.audiovisualOnly && !AUDIOVISUAL_TERMS.test(described)) continue;

    result.push({ title: title.slice(0, 300), url: url.toString() });
    if (result.length >= limit) break;
  }
  return result;
}

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function isoDate(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function datesIn(text: string): string[] {
  const dates: string[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) {
    const date = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (date) dates.push(date);
  }
  for (const m of text.matchAll(/\b(\d{1,2})º? de ([a-zç]+) de (\d{4})\b/gi)) {
    const month = MONTHS[(m[2] ?? "").toLowerCase()];
    const date = month ? isoDate(Number(m[1]), month, Number(m[3])) : null;
    if (date) dates.push(date);
  }
  return dates;
}

/**
 * Prazo provável: maior data encontrada perto de termos de inscrição/prazo
 * (ex.: "inscrições de 01/10/2026 a 30/11/2026" → 2026-11-30).
 */
export function findDeadline(text: string): string | null {
  const windows: string[] = [];
  for (const m of text.matchAll(
    /(inscri[cç]\w*|prazo|encerra\w*|at[eé] o dia|at[eé] \d|per[ií]odo)/gi,
  )) {
    windows.push(text.slice(m.index ?? 0, (m.index ?? 0) + 160));
  }
  const dates = windows.flatMap(datesIn).sort();
  return dates.at(-1) ?? null;
}

function parseAmount(number: string, scale: string | undefined): number | null {
  const value = Number(number.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const word = (scale ?? "").toLowerCase();
  const multiplier = word.startsWith("bilh")
    ? 1e9
    : word.startsWith("milh")
      ? 1e6
      : word === "mil"
        ? 1e3
        : 1;
  return Math.round(value * multiplier * 100) / 100;
}

/**
 * Valor total provável: maior valor em R$ perto de termos como "valor total",
 * "investimento", "recursos" (ex.: "R$ 10 milhões", "R$ 2.500.000,00").
 */
export function findTotalAmount(text: string): number | null {
  const values: number[] = [];
  for (const m of text.matchAll(
    /(valor|total|investimento|recursos?|montante|aporte|disponibiliz\w+|or[cç]amento)/gi,
  )) {
    const window = text.slice(m.index ?? 0, (m.index ?? 0) + 140);
    for (const v of window.matchAll(
      /R\$\s*([\d.]+(?:,\d{1,2})?)\s*(mil(?:h(?:ão|ões|ao|oes))?|bilh\w+)?/gi,
    )) {
      const value = parseAmount(v[1] ?? "", v[2]);
      if (value && value >= 1000) values.push(value);
    }
  }
  return values.length > 0 ? Math.max(...values) : null;
}

/** Status sugerido a partir do prazo encontrado. */
export function statusFromDeadline(
  deadline: string | null,
  today: string,
): "open" | "closed" | null {
  if (!deadline) return null;
  return deadline >= today ? "open" : "closed";
}
