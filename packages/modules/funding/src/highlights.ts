/**
 * Destaques de um edital para a tela "Analisar Edital" (V1, regras determinísticas).
 *
 * Tudo aqui é TRECHO LITERAL do documento: nada é resumido, reescrito ou inventado.
 * Cada destaque carrega a evidência (origem) — o mesmo formato de `extract.ts`.
 * Quando um tema não é encontrado, a lista fica vazia (a tela diz "não identificado").
 * Uma análise por IA (ADR-0006, `EditalAnalyzer`) pode complementar isto no futuro.
 */
import type { Evidence } from "./extract";
import { normalize } from "./territory";

export type Highlight = { text: string; evidence: Evidence };

export type EditalHighlights = {
  /** Linha de título do edital ("EDITAL Nº 5/2026 — …"). */
  title: Highlight | null;
  /** Órgão/instituição responsável, quando aparece numa linha curta. */
  institution: Highlight | null;
  /** Objeto do edital (primeiro trecho que o define). */
  object: Highlight | null;
  /** Quem pode participar. */
  participation: Highlight[];
  /** Requisitos e condições de participação. */
  requirements: Highlight[];
  /** Documentação exigida. */
  documents: Highlight[];
};

const MAX_TEXT = 320;
const LIMITS = { participation: 4, requirements: 5, documents: 8 } as const;

/** Linha que COMEÇA pela palavra (evita frases comuns que só mencionam "edital"). */
const TITLE = /^[^\p{L}]*(edital|chamada|chamamento|premio|concurso|selecao publica|programa)\b/u;
const INSTITUTION =
  /\b(secretaria|ministerio|fundacao|instituto|agencia|ancine|spcine|riofilme|prefeitura|governo|empresa|companhia|brde|fundo setorial)\b/;
const OBJECT =
  /(tem (como|por) objet|constitui objet|objeto (deste|do presente|desta|da presente)|^(do|o) objeto\b|\bobjetivo (deste|do presente|desta)|\bvisa (selecionar|apoiar|premiar|fomentar))/;
const PARTICIPATION =
  /(podem participar|poderao participar|podem se inscrever|poderao se inscrever|podem concorrer|poderao concorrer|destinad[oa]s? (a|as|aos)|aberto a|abertas a|elegiveis|sao proponentes|participacao (e|sera) (restrita|permitida|vedada)|vedad[oa] a participacao|nao podem participar|nao poderao participar)/;
const REQUIREMENT =
  /(requisito|devera comprovar|deverao comprovar|deve comprovar|devem comprovar|e necessario|e obrigatori|sera exigid|exige-se|obrigatoriamente|condicao para|registro (na|regular)|ter sede|estar sediad|ter no minimo|possuir)/;
const DOCUMENT =
  /(documento|documentacao|certidao|certidoes|comprovante|cnpj|contrato social|estatuto|portfolio|curriculo|orcamento|cronograma|carta de anuencia|declaracao|roteiro|plano de (negocio|distribuicao)|registro na ancine)/;
const DOCUMENT_HEADING =
  /^(\d+[.)]?\s*|[ivx]+[.)-]\s*|capitulo \w+\s*[-–—]?\s*)?(da |dos |das )?(documentacao|documentos)\b/;

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1).trimEnd()}…` : clean;
}

/** Linhas e frases do documento (o PDF vem com quebras de linha "duras"). */
function segments(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/))
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 3);
}

/** Títulos de seção ("DOS REQUISITOS", "3. DA PARTICIPAÇÃO") não são conteúdo. */
function isHeading(part: string): boolean {
  if (part.length > 80) return false;
  if (part === part.toUpperCase() && /\p{Lu}/u.test(part)) return true;
  return /^[\d.\s]*(do|da|dos|das)\s[^.;:]*$/.test(normalize(part)) && part.length <= 60;
}

function pickAll(parts: string[], pattern: RegExp, limit: number, used: Set<string>): string[] {
  const found: string[] = [];
  for (const part of parts) {
    if (found.length >= limit) break;
    const key = normalize(part);
    if (used.has(key) || isHeading(part) || !pattern.test(key) || part.length < 12) continue;
    used.add(key);
    found.push(part);
  }
  return found;
}

/** Itens logo abaixo de um título "DA DOCUMENTAÇÃO" (listas a), b), c)… ou I, II…). */
function documentSection(lines: string[]): string[] {
  const start = lines.findIndex(
    (line) => line.length <= 80 && DOCUMENT_HEADING.test(normalize(line)),
  );
  if (start < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const key = normalize(line);
    // Próximo título (curto, sem ponto final, em maiúsculas ou "Art."/capítulo) encerra a seção.
    const isHeading =
      (line === line.toUpperCase() && /[A-Z]/.test(line) && line.length <= 80) ||
      /^(art\.?|artigo|capitulo)\s/.test(key);
    if (isHeading && items.length > 0) break;
    if (isHeading) continue;
    items.push(line);
    if (items.length >= LIMITS.documents) break;
  }
  return items;
}

export function extractHighlights(
  text: string,
  source: { kind: "page" | "pdf"; label?: string } = { kind: "pdf" },
): EditalHighlights {
  const evidence = (snippet: string): Evidence => ({
    snippet,
    source: source.kind,
    ...(source.label ? { label: source.label } : {}),
  });
  const highlight = (part: string): Highlight => {
    const clipped = clip(part);
    return { text: clipped, evidence: evidence(clipped) };
  };

  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const parts = segments(text);
  const used = new Set<string>();

  const titleLine = lines
    .slice(0, 15)
    .find((line) => line.length <= 200 && TITLE.test(normalize(line)));
  const institutionLine = lines
    .slice(0, 40)
    .find((line) => line.length <= 140 && INSTITUTION.test(normalize(line)) && line !== titleLine);
  const objectPart = parts.find(
    (part) => !isHeading(part) && OBJECT.test(normalize(part)) && part.length >= 20,
  );
  if (objectPart) used.add(normalize(objectPart));

  const sectionDocs = documentSection(lines);
  sectionDocs.forEach((item) => used.add(normalize(item)));
  const documents = [
    ...sectionDocs,
    ...pickAll(parts, DOCUMENT, LIMITS.documents - sectionDocs.length, used),
  ];

  return {
    title: titleLine ? highlight(titleLine) : null,
    institution: institutionLine ? highlight(institutionLine) : null,
    object: objectPart ? highlight(objectPart) : null,
    participation: pickAll(parts, PARTICIPATION, LIMITS.participation, used).map(highlight),
    requirements: pickAll(parts, REQUIREMENT, LIMITS.requirements, used).map(highlight),
    documents: documents.slice(0, LIMITS.documents).map(highlight),
  };
}
