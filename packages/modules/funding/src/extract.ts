/**
 * Extração ampliada com evidência por campo (sem IA).
 *
 * Cada campo sugerido traz o trecho do texto que o fundamenta e de onde veio
 * (página ou PDF do regulamento). Tudo é SUGESTÃO para revisão humana (ADR-0009):
 * na dúvida, o campo fica vazio. Quando página e PDF discordam, vale o PDF
 * (regulamento) e a divergência é registrada.
 */
import { normalize } from "./territory";

export type TextSource = { kind: "page" | "pdf"; text: string; label?: string };

export type Evidence = { snippet: string; source: "page" | "pdf"; label?: string };

export type Extracted<T> = { value: T; evidence: Evidence };

export type ExtractedFields = {
  /** Prazo final de inscrição (AAAA-MM-DD). */
  deadline: Extracted<string> | null;
  /** Abertura das inscrições (AAAA-MM-DD). */
  opensAt: Extracted<string> | null;
  totalAmount: Extracted<number> | null;
  maxAmountPerProject: Extracted<number> | null;
  /** Quantidade de projetos a selecionar. */
  projectCount: Extracted<number> | null;
  formats: Extracted<string[]> | null;
  genres: Extracted<string[]> | null;
  stages: Extracted<string[]> | null;
  /** Campos em que página e PDF discordam (vale o PDF). */
  conflicts: string[];
};

export type FieldKey = Exclude<keyof ExtractedFields, "conflicts">;

export const FIELD_LABELS: Record<FieldKey, string> = {
  deadline: "Prazo final de inscrição",
  opensAt: "Abertura das inscrições",
  totalAmount: "Valor total",
  maxAmountPerProject: "Valor máximo por projeto",
  projectCount: "Quantidade de projetos",
  formats: "Formatos",
  genres: "Gêneros",
  stages: "Estágios",
};

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
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

/** Datas em ordem de aparição ("30/11/2026", "30 de novembro de 2026"). */
function datesIn(text: string): { date: string; index: number }[] {
  const found: { date: string; index: number }[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g)) {
    const date = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (date) found.push({ date, index: m.index ?? 0 });
  }
  for (const m of text.matchAll(/\b(\d{1,2})[oº]? de ([a-z]+) de (\d{4})\b/g)) {
    const month = MONTHS[m[2] ?? ""];
    const date = month ? isoDate(Number(m[1]), month, Number(m[3])) : null;
    if (date) found.push({ date, index: m.index ?? 0 });
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Trecho legível em volta da posição (texto original, sem normalizar). */
function snippet(original: string, start: number, end: number): string {
  const from = Math.max(0, start - 60);
  const to = Math.min(original.length, end + 100);
  const text = original.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${text}${to < original.length ? "…" : ""}`;
}

/** Texto em minúsculas e sem acentos, com o MESMO comprimento do original (índices valem nos dois). */
function fold(text: string): string {
  return Array.from(text, (char) => {
    const plain = normalize(char);
    return plain.length === 1 ? plain : char.toLowerCase().length === 1 ? char.toLowerCase() : " ";
  }).join("");
}

function parseAmount(number: string, scale: string | undefined): number | null {
  const value = Number(number.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const word = scale ?? "";
  const multiplier = word.startsWith("bilh")
    ? 1e9
    : word.startsWith("milh")
      ? 1e6
      : word === "mil"
        ? 1e3
        : 1;
  return Math.round(value * multiplier * 100) / 100;
}

const MONEY = /r\$\s*([\d.]+(?:,\d{1,2})?)\s*(mil(?:hao|hoes)?|bilh\w+)?/g;
const INSCRIPTION =
  /(inscri[cç]\w*|prazo|encerra\w*|at[eé] o dia|per[ií]odo de (submiss|envio|inscri))/g;
/** Logo depois do valor: "R$ 200 mil por projeto". */
const PER_PROJECT_AFTER =
  /^\s*(\([^)]*\)\s*)?(,\s*)?(por (projeto|proposta|obra|premiad\w*|contemplad\w*|selecionad\w*)|para cada (projeto|proposta)|a cada (projeto|proposta)|cada (projeto|proposta))/;
/** Logo antes do valor: "valor máximo por projeto de R$", "cada projeto poderá receber até R$". */
const PER_PROJECT_BEFORE =
  /(valor maximo (por|de cada) (projeto|proposta)|por (projeto|proposta)[^.]{0,20}|cada (projeto|proposta)[^.]{0,30}|teto (por|de cada) (projeto|proposta))\s*(de\s*)?(ate\s*)?$/;

type Found<T> = { value: T; start: number; end: number };

function findDeadlines(text: string): {
  deadline: Found<string> | null;
  opensAt: Found<string> | null;
} {
  let deadline: Found<string> | null = null;
  let opensAt: Found<string> | null = null;
  for (const m of text.matchAll(INSCRIPTION)) {
    const start = m.index ?? 0;
    const window = text.slice(start, start + 160);
    const dates = datesIn(window);
    if (dates.length === 0) continue;
    const last = dates.reduce((a, b) => (b.date > a.date ? b : a));
    if (!deadline || last.date > deadline.value) {
      deadline = { value: last.date, start, end: start + last.index + 10 };
    }
    // "de 01/10/2026 a 30/11/2026": a primeira data da janela é a abertura.
    if (dates.length >= 2 && dates[0]!.date < last.date && /inscri/.test(window.slice(0, 20))) {
      const first = dates[0]!;
      if (!opensAt || first.date < opensAt.value) {
        opensAt = { value: first.date, start, end: start + first.index + 10 };
      }
    }
  }
  return { deadline, opensAt };
}

function findTotal(text: string): Found<number> | null {
  let best: Found<number> | null = null;
  for (const m of text.matchAll(
    /(valor (global|total)|total de|investimento|recursos?|montante|aporte|disponibiliz\w+|orcamento)/g,
  )) {
    const start = m.index ?? 0;
    const window = text.slice(start, start + 140);
    for (const v of window.matchAll(MONEY)) {
      // "R$ 200 mil por projeto" é valor por projeto, não total.
      const after = window.slice((v.index ?? 0) + v[0].length, (v.index ?? 0) + v[0].length + 40);
      const before = text.slice(Math.max(0, start + (v.index ?? 0) - 50), start + (v.index ?? 0));
      if (PER_PROJECT_AFTER.test(after) || PER_PROJECT_BEFORE.test(before)) continue;
      const value = parseAmount(v[1] ?? "", v[2]);
      if (value && value >= 1000 && (!best || value > best.value)) {
        best = { value, start, end: start + (v.index ?? 0) + v[0].length };
      }
    }
  }
  return best;
}

function findPerProject(text: string): Found<number> | null {
  let best: Found<number> | null = null;
  for (const v of text.matchAll(MONEY)) {
    const index = v.index ?? 0;
    const before = text.slice(Math.max(0, index - 50), index);
    const after = text.slice(index + v[0].length, index + v[0].length + 40);
    if (!PER_PROJECT_AFTER.test(after) && !PER_PROJECT_BEFORE.test(before)) continue;
    const value = parseAmount(v[1] ?? "", v[2]);
    if (value && value >= 1000 && (!best || value > best.value)) {
      best = { value, start: Math.max(0, index - 60), end: index + v[0].length + 40 };
    }
  }
  return best;
}

function findProjectCount(text: string): Found<number> | null {
  const m = text.match(
    /(ate|serao (selecionad|contemplad|premiad)\w*|selecao de|contemplara|premiara)\s+(\d{1,3})(\s*\([a-z ]+\))?\s+(projetos|propostas|obras|filmes|series|premios)/,
  );
  if (!m) return null;
  const value = Number(m[3]);
  return value > 0 && value <= 500
    ? { value, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }
    : null;
}

const FORMAT_RULES: [RegExp, string][] = [
  [/\blongas?[- ]metragens?\b|\blongas?\b(?= de (ficcao|animacao|documentario))/, "feature_film"],
  [/\bcurtas?[- ]metragens?\b/, "short_film"],
  [
    /\bseries?\b (de|para|documentais|animadas|de ficcao|televisiv|seriad)|\bobras? seriadas?\b|\bseriados?\b/,
    "series",
  ],
  [/\btelefilmes?\b/, "tv_movie"],
];
const GENRE_RULES: [RegExp, string][] = [
  [/\bficcao\b/, "fiction"],
  [/\bdocumentari(o|os|a|as)\b/, "documentary"],
  [/\banimac(ao|oes)\b|\banimad[ao]s?\b/, "animation"],
];
const STAGE_RULES: [RegExp, string][] = [
  [/\bdesenvolvimento de (projetos?|roteiros?|obras?|series?|longas?|formatos?)\b/, "development"],
  [
    /\bproducao de (longas?|curtas?|obras?|series?|filmes?|documentarios?|telefilmes?)\b/,
    "production",
  ],
  [/\b(finalizacao|pos-producao|pos producao)\b/, "post_production"],
  [
    /\b(distribuicao|comercializacao|lancamento) (de|em) (obras?|filmes?|longas?|salas)\b/,
    "distribution",
  ],
];

function findVocabulary(text: string, rules: [RegExp, string][]): Found<string[]> | null {
  const values: string[] = [];
  let first: { start: number; end: number } | null = null;
  for (const [pattern, code] of rules) {
    const m = text.match(pattern);
    if (!m) continue;
    values.push(code);
    const start = m.index ?? 0;
    if (!first || start < first.start) first = { start, end: start + m[0].length };
  }
  return values.length > 0 && first ? { value: values, ...first } : null;
}

type Finder = (folded: string) => Found<unknown> | null;

const FINDERS: Record<FieldKey, Finder> = {
  deadline: (t) => findDeadlines(t).deadline,
  opensAt: (t) => findDeadlines(t).opensAt,
  totalAmount: findTotal,
  maxAmountPerProject: findPerProject,
  projectCount: findProjectCount,
  formats: (t) => findVocabulary(t, FORMAT_RULES),
  genres: (t) => findVocabulary(t, GENRE_RULES),
  stages: (t) => findVocabulary(t, STAGE_RULES),
};

export function extractFields(sources: TextSource[]): ExtractedFields {
  // Regulamento (PDF) primeiro: é a fonte oficial das regras.
  const ordered = [...sources].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "pdf" ? -1 : 1));
  const prepared = ordered
    .filter((source) => source.text.trim())
    .map((source) => ({ ...source, folded: fold(source.text) }));

  const result = { conflicts: [] as string[] } as ExtractedFields;
  for (const key of Object.keys(FINDERS) as FieldKey[]) {
    const hits = prepared
      .map((source) => ({ source, found: FINDERS[key](source.folded) }))
      .filter(
        (hit): hit is { source: (typeof prepared)[number]; found: Found<unknown> } =>
          hit.found !== null,
      );
    const chosen = hits[0];
    (result as Record<FieldKey, Extracted<unknown> | null>)[key] = chosen
      ? {
          value: chosen.found.value,
          evidence: {
            snippet: snippet(chosen.source.text, chosen.found.start, chosen.found.end),
            source: chosen.source.kind,
            ...(chosen.source.label ? { label: chosen.source.label } : {}),
          },
        }
      : null;
    const distinct = new Set(hits.map((hit) => JSON.stringify(hit.found.value)));
    if (distinct.size > 1) result.conflicts.push(key);
  }
  return result;
}

/** Formato gravado em core.editais.field_evidence (só os campos encontrados). */
export function evidenceRecord(fields: ExtractedFields): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(FIELD_LABELS) as FieldKey[]) {
    const field = fields[key];
    if (field) record[key] = { value: field.value, ...field.evidence };
  }
  if (fields.conflicts.length > 0) record.conflicts = fields.conflicts;
  return record;
}

export type PdfReading = { pages: number; scanned: boolean; truncated: boolean; error?: string };

/** Avisos da extração em pt-BR (gravados em core.editais.extraction_notes). */
export function extractionNotes(fields: ExtractedFields, pdf?: PdfReading | null): string[] {
  const notes: string[] = [];
  if (pdf?.error) notes.push(`PDF: ${pdf.error} Confira o documento manualmente.`);
  if (pdf?.scanned)
    notes.push(
      "O PDF parece digitalizado (imagem). Sem OCR, o texto não foi lido: confira o documento manualmente.",
    );
  if (pdf?.truncated) notes.push("PDF longo: só as primeiras páginas foram lidas.");
  if (fields.conflicts.length > 0)
    notes.push(
      `Página e regulamento divergem em: ${fields.conflicts.map((key) => FIELD_LABELS[key as FieldKey]).join(", ")} (vale o regulamento).`,
    );
  return notes;
}

/**
 * Colunas de core.editais sugeridas pela extração. Só inclui o que foi encontrado:
 * nunca apaga um valor existente com "vazio".
 */
export function suggestionColumns(
  fields: ExtractedFields,
  { today, pdf }: { today: string; pdf?: PdfReading | null },
): Record<string, unknown> {
  const columns: Record<string, unknown> = {
    field_evidence: evidenceRecord(fields),
    extraction_notes: extractionNotes(fields, pdf),
  };
  if (fields.deadline) {
    columns.deadline = `${fields.deadline.value}T23:59:00-03:00`;
    columns.status =
      fields.opensAt && fields.opensAt.value > today
        ? "upcoming"
        : fields.deadline.value >= today
          ? "open"
          : "closed";
  }
  if (fields.totalAmount) columns.total_amount = fields.totalAmount.value;
  if (fields.maxAmountPerProject) columns.max_amount_per_project = fields.maxAmountPerProject.value;
  if (fields.formats) columns.accepted_formats = fields.formats.value;
  if (fields.genres) columns.accepted_genres = fields.genres.value;
  if (fields.stages) columns.accepted_stages = fields.stages.value;
  return columns;
}
