/**
 * Regras da inscrição extraídas do texto do edital (Área de Trabalho, ADR-0026).
 *
 * Mesma filosofia de `extract.ts`/`highlights.ts`: regras determinísticas, sem IA,
 * e TODA regra carrega o trecho literal que a fundamenta. Na dúvida, nada é extraído
 * (a equipe adiciona o item à mão). Uma análise por IA poderá complementar isto
 * no futuro pelo ponto de integração `WorkspaceReviewer` (`@lep/ai`).
 */
import { extractHighlights, type Highlight } from "../highlights";
import { normalize } from "../territory";

export type RuleEvidence = { snippet: string; source: "page" | "pdf" | "fields" };

/** Texto exigido com limite (sinopse até 1.500 caracteres, argumento até 5 páginas...). */
export type TextRequirement = {
  key: string;
  label: string;
  charLimit: number | null;
  wordLimit: number | null;
  pageLimit: number | null;
  evidence: RuleEvidence;
};

export type CriterionRule = { text: string; points: number | null; evidence: RuleEvidence };

export type SimpleRule = { text: string; evidence: RuleEvidence };

export type WorkspaceRules = {
  version: 1;
  textLimits: TextRequirement[];
  /** Textos citados sem limite identificado (sinopse, justificativa...). */
  texts: { key: string; label: string; evidence: RuleEvidence }[];
  criteria: CriterionRule[];
  bonus: SimpleRule[];
  rights: SimpleRule[];
  team: SimpleRule[];
  documents: SimpleRule[];
  budget: SimpleRule[];
  /** Contrapartida mínima exigida, em % do orçamento (quando o edital fixa). */
  counterpartMinPercent: { value: number; evidence: RuleEvidence } | null;
  /** Teto de despesas administrativas, em % (não verificável sem a planilha: vira lembrete). */
  adminMaxPercent: { value: number; evidence: RuleEvidence } | null;
};

export const EMPTY_RULES: WorkspaceRules = {
  version: 1,
  textLimits: [],
  texts: [],
  criteria: [],
  bonus: [],
  rights: [],
  team: [],
  documents: [],
  budget: [],
  counterpartMinPercent: null,
  adminMaxPercent: null,
};

const MAX_SNIPPET = 320;
const LIMITS = { criteria: 12, bonus: 8, rights: 8, team: 6, budget: 6, texts: 12 } as const;

/** Textos que costumam ser exigidos em editais audiovisuais (normalizado → rótulo). */
export const KNOWN_TEXTS: [RegExp, string, string][] = [
  [/\blogline\b/, "logline", "Logline"],
  [/\bstoryline\b/, "storyline", "Storyline"],
  [/\bsinopse\b/, "sinopse", "Sinopse"],
  [/\bargumento\b/, "argumento", "Argumento"],
  [/\broteiro\b/, "roteiro", "Roteiro"],
  [/\bjustificativa\b/, "justificativa", "Justificativa"],
  [/\bobjetivos?\b/, "objetivos", "Objetivos"],
  [
    /\b(visao|proposta) (do diretor|da diretora|de direcao)\b/,
    "visao-direcao",
    "Visão / proposta de direção",
  ],
  [/\bproposta (artistica|estetica)\b/, "proposta-artistica", "Proposta artística"],
  [/\b(apresentacao|descricao) do projeto\b/, "descricao-projeto", "Apresentação do projeto"],
  [/\bmemorial descritivo\b/, "memorial", "Memorial descritivo"],
  [/\bplano de (distribuicao|difusao|circulacao)\b/, "plano-distribuicao", "Plano de distribuição"],
  [/\bplano de (comunicacao|divulgacao)\b/, "plano-comunicacao", "Plano de comunicação"],
  [/\b(proposta|plano) de acessibilidade\b/, "acessibilidade", "Proposta de acessibilidade"],
  [
    /\bcontrapartidas? (sociais?|culturais?)\b/,
    "contrapartida-social",
    "Contrapartida social/cultural",
  ],
  [/\bpublico[- ]alvo\b/, "publico-alvo", "Público-alvo"],
  [/\b(curriculo|minicurriculo)\b/, "curriculos", "Currículos"],
  [/\bperfil d[oa]s? personage(m|ns)\b/, "personagens", "Perfil dos personagens"],
];

const CRITERIA_HEADING = /\bcriterios? de (avaliacao|selecao|julgamento|pontuacao|analise)\b/;
const POINTS = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:\(\s*[a-z ]+\)\s*)?(pontos|pts|ponto)\b/;
const CRITERION_LINE =
  /(\bpontos?\b|\bpts\b|\bpeso\b|\bnota (de|entre|maxima)\b|\bpontuacao (maxima|de)\b|criterio)/;
const BONUS =
  /(pontuacao (adicional|extra|bonus)|bonificac|\bbonus\b|acrescid[oa] de \d+ pontos|\binducao\b|acoes afirmativas|reserva de vagas|\bcotas?\b|proponentes? (negr|indigen|mulher|lgbt|trans|pcd|com deficiencia|quilombol)|pessoas? (negras|indigenas|com deficiencia|trans)|regionaliza|estreante|primeira obra)/;
const RIGHTS =
  /(cessao de direitos|direitos autorais|direitos patrimoniais|direitos de (exibicao|uso|imagem)|autorizacao de uso|uso de imagem|contrato de opcao|opcao de direitos|cadeia de titularidade|registro (do roteiro|da obra|na biblioteca nacional|no edl)|anuencia d[oa]s? (autor|autora|detentor|titular)|termo de cessao|carta de anuencia|licenca de uso|direitos sobre a obra)/;
const TEAM =
  /((diretor|diretora|produtor|produtora|roteirista|equipe|ficha tecnica|chefes? de equipe|profissionais?|coordenador|responsavel tecnic)[^.;]*(curriculo|experiencia|comprova|portfolio|filmografia|vinculo))/;
const BUDGET =
  /(planilha orcamentaria|orcamento (detalhado|analitico|global|do projeto)|cronograma (fisico|de desembolso|financeiro)|contrapartida|despesas administrativas|taxa de administracao|custos administrativos|itens (financiaveis|nao financiaveis)|rubricas?)/;
const COUNTERPART =
  /contrapartida[^.;]{0,60}?(?:minima )?(?:de|equivalente a)?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/;
const ADMIN =
  /(despesas administrativas|taxa de administracao|custos administrativos|gestao do projeto)[^.;]{0,80}?(\d{1,2}(?:[.,]\d+)?)\s*%/;

/** Limite de tamanho: "até 1.500 caracteres", "máximo de 5 (cinco) páginas", "no máximo 300 palavras". */
const SIZE_LIMIT =
  /(?:ate|maximo de|no maximo|limite de|limitad[oa]s? a|nao (?:podera|deve|deverao|poderao) (?:ultrapassar|exceder)|max\.?)\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:\([a-z\s]+\)\s*)?(caracteres|paginas|laudas|palavras)/g;

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_SNIPPET ? `${clean.slice(0, MAX_SNIPPET - 1).trimEnd()}…` : clean;
}

function segments(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/))
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 8);
}

const toNumber = (raw: string) => Number(raw.replace(/\./g, "").replace(",", "."));

/** Remove marcadores de lista ("I -", "a)", "3.") e pontuação final de um item. */
export function cleanListItem(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[IVXLCivxlc]{1,6}|\d{1,3}(?:\.\d{1,3})*|[a-zA-Z])\s*[-–—).:]\s+/, "")
    .replace(/[\s;,.:]+$/, "");
}

/** Chave curta e estável de um texto (para não duplicar itens ao regerar). */
export function stableKey(prefix: string, text: string): string {
  const key = normalize(cleanListItem(text))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  return `${prefix}:${hash.toString(36)}`;
}

export function knownText(normalized: string): { key: string; label: string } | null {
  for (const [pattern, key, label] of KNOWN_TEXTS) {
    if (pattern.test(normalized)) return { key, label };
  }
  return null;
}

function textLimits(parts: string[], source: RuleEvidence["source"]): TextRequirement[] {
  const byKey = new Map<string, TextRequirement>();
  parts.forEach((part, index) => {
    const key = normalize(part);
    const matches = [...key.matchAll(SIZE_LIMIT)];
    if (matches.length === 0) return;
    // O nome do texto costuma estar no próprio trecho ou na linha anterior ("Sinopse:" / "a) Sinopse").
    const named = knownText(key) ?? knownText(normalize(parts[index - 1] ?? ""));
    const id = named?.key ?? stableKey("texto", part);
    const current = byKey.get(id) ?? {
      key: id,
      label: named?.label ?? "Texto exigido (ver trecho)",
      charLimit: null,
      wordLimit: null,
      pageLimit: null,
      evidence: { snippet: clip(part), source },
    };
    for (const match of matches) {
      const value = toNumber(match[1] ?? "");
      if (!Number.isFinite(value) || value <= 0) continue;
      const unit = match[2];
      if (unit === "caracteres") current.charLimit = current.charLimit ?? value;
      else if (unit === "palavras") current.wordLimit = current.wordLimit ?? value;
      else current.pageLimit = current.pageLimit ?? value;
    }
    if (current.charLimit || current.wordLimit || current.pageLimit) byKey.set(id, current);
  });
  return [...byKey.values()];
}

function collect(
  parts: string[],
  pattern: RegExp,
  limit: number,
  source: RuleEvidence["source"],
  used: Set<string>,
): SimpleRule[] {
  const found: SimpleRule[] = [];
  for (const part of parts) {
    if (found.length >= limit) break;
    const key = normalize(part);
    if (part.length < 15 || used.has(key) || !pattern.test(key)) continue;
    used.add(key);
    found.push({ text: clip(part), evidence: { snippet: clip(part), source } });
  }
  return found;
}

/** Critérios de avaliação: linhas com pontuação/peso, de preferência na seção de critérios. */
function criteria(parts: string[], source: RuleEvidence["source"]): CriterionRule[] {
  const start = parts.findIndex((part) => CRITERIA_HEADING.test(normalize(part)));
  const scope = start >= 0 ? parts.slice(start, start + 60) : parts;
  const found: CriterionRule[] = [];
  const seen = new Set<string>();
  for (const part of scope) {
    if (found.length >= LIMITS.criteria) break;
    const key = normalize(part);
    if (part.length < 10 || seen.has(key)) continue;
    const points = key.match(POINTS);
    const isCriterion =
      (start >= 0 && points !== null) || (CRITERION_LINE.test(key) && points !== null);
    if (!isCriterion) continue;
    seen.add(key);
    found.push({
      text: clip(part),
      points: points ? toNumber(points[1] ?? "") : null,
      evidence: { snippet: clip(part), source },
    });
  }
  return found;
}

function percentRule(
  parts: string[],
  pattern: RegExp,
  group: number,
  source: RuleEvidence["source"],
) {
  for (const part of parts) {
    const match = normalize(part).match(pattern);
    const value = match ? toNumber(match[group] ?? "") : NaN;
    if (Number.isFinite(value) && value > 0 && value < 100) {
      return { value, evidence: { snippet: clip(part), source } };
    }
  }
  return null;
}

/**
 * Extrai as regras da inscrição a partir do texto do edital (PDF/página) ou, sem
 * documento, dos campos já cadastrados (`source: "fields"`).
 */
export function extractWorkspaceRules(
  text: string,
  source: RuleEvidence["source"] = "pdf",
): WorkspaceRules {
  if (!text.trim()) return { ...EMPTY_RULES };
  const parts = segments(text);
  const limits = textLimits(parts, source);
  const limitKeys = new Set(limits.map((item) => item.key));

  // Textos citados como exigidos, mesmo sem limite ("apresentar sinopse e justificativa").
  const texts: WorkspaceRules["texts"] = [];
  for (const part of parts) {
    if (texts.length >= LIMITS.texts) break;
    const key = normalize(part);
    if (
      !/(apresentar|anexar|enviar|contendo|deve(ra)? conter|formulario|inscricao|proposta)/.test(
        key,
      )
    ) {
      continue;
    }
    for (const [pattern, id, label] of KNOWN_TEXTS) {
      if (!pattern.test(key) || limitKeys.has(id) || texts.some((item) => item.key === id))
        continue;
      texts.push({ key: id, label, evidence: { snippet: clip(part), source } });
    }
  }

  const used = new Set<string>();
  const highlights = extractHighlights(text, { kind: source === "page" ? "page" : "pdf" });
  return {
    version: 1,
    textLimits: limits,
    texts,
    criteria: criteria(parts, source),
    bonus: collect(parts, BONUS, LIMITS.bonus, source, used),
    rights: collect(parts, RIGHTS, LIMITS.rights, source, used),
    team: collect(parts, TEAM, LIMITS.team, source, used),
    documents: highlights.documents.map((item: Highlight) => ({
      text: item.text,
      evidence: { snippet: item.evidence.snippet, source },
    })),
    budget: collect(parts, BUDGET, LIMITS.budget, source, used),
    counterpartMinPercent: percentRule(parts, COUNTERPART, 1, source),
    adminMaxPercent: percentRule(parts, ADMIN, 2, source),
  };
}

/** Lê as regras gravadas (jsonb) de forma defensiva. */
export function parseWorkspaceRules(value: unknown): WorkspaceRules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_RULES };
  const record = value as Partial<WorkspaceRules>;
  const list = <T>(items: unknown): T[] => (Array.isArray(items) ? (items as T[]) : []);
  return {
    version: 1,
    textLimits: list(record.textLimits),
    texts: list(record.texts),
    criteria: list(record.criteria),
    bonus: list(record.bonus),
    rights: list(record.rights),
    team: list(record.team),
    documents: list(record.documents),
    budget: list(record.budget),
    counterpartMinPercent: record.counterpartMinPercent ?? null,
    adminMaxPercent: record.adminMaxPercent ?? null,
  };
}
