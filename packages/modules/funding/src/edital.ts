/**
 * Modelo de domínio do edital (lido de core.editais).
 *
 * A tabela core.editais foi criada inicialmente fora das migrações; `toEdital`
 * normaliza a linha vinda do banco de forma defensiva (listas podem vir como
 * texto, números como string etc.) para a interface nunca quebrar.
 */

import { isEligibilityStatus, type EligibilityStatus } from "./eligibility";
import { OPPORTUNITY_KINDS, type OpportunityKind } from "./page-classifier";

export type EditalLink = { label: string; url: string };

export type Edital = {
  id: string;
  title: string;
  agency: string | null;
  status: string | null;
  deadline: string | null;
  totalAmount: number | null;
  maxAmountPerProject: number | null;
  summary: string | null;
  eligibilityCriteria: string[];
  categories: string[];
  requiredDocuments: string[];
  officialUrl: string | null;
  officialLinks: EditalLink[];
  acceptedFormats: string[];
  acceptedGenres: string[];
  acceptedStages: string[];
  minBudget: number | null;
  maxBudget: number | null;
  reviewStatus: string | null;
  /** manual | monitor (importado pela varredura automática). */
  origin: string;
  sourceId: string | null;
  discoveredAt: string | null;
  /** Territórios de sede aceitos para o proponente ("BR", "SP", "SP:São Paulo"...). */
  eligibleTerritories: string[];
  /** Motivo do descarte na triagem (legado: descartes automáticos anteriores à etapa 5). */
  triageReason: string | null;
  /** Elegibilidade da LEP como proponente (terceiro eixo; ver eligibility.ts). */
  eligibilityStatus: EligibilityStatus;
  eligibilityReason: string | null;
  eligibilityEvidence: string | null;
  /** auto (regras) | manual (definida pela equipe). */
  eligibilitySource: "auto" | "manual";
  /** Classificação da página pela varredura (etapa 6); null = cadastro manual/anterior. */
  pageType: "opportunity" | "uncertain" | null;
  opportunityKind: OpportunityKind | null;
  pageTypeReasons: string[];
};

export const EDITAL_STATUS_LABELS: Record<string, string> = {
  open: "Inscrições abertas",
  upcoming: "Em breve",
  closed: "Encerrado",
  suspended: "Suspenso",
  under_review: "Em avaliação",
  result_published: "Resultado publicado",
};

/** Variações em português (ex.: cadastros manuais antigos) → códigos internos. */
const STATUS_ALIASES: Record<string, string> = {
  aberto: "open",
  aberta: "open",
  "inscrições abertas": "open",
  "inscricoes abertas": "open",
  "em breve": "upcoming",
  previsto: "upcoming",
  encerrado: "closed",
  encerrada: "closed",
  fechado: "closed",
  suspenso: "suspended",
  "em avaliação": "under_review",
  "em avaliacao": "under_review",
  "resultado publicado": "result_published",
  validado: "validated",
  pendente: "pending",
  descartado: "discarded",
};

export function normalizeCode(value: string | null): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return STATUS_ALIASES[key] ?? key;
}

/** Estados que impedem nova inscrição. */
export const CLOSED_STATUSES = new Set(["closed", "suspended", "result_published"]);

/**
 * Converte o prazo em Date. Data sem hora ("2026-10-10") = 23:59:59 no horário
 * de Brasília (UTC−3, sem horário de verão desde 2019), padrão usual dos editais.
 */
export function parseDeadline(value: string | null): Date | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59-03:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function editalStatusLabel(status: string | null): string {
  if (!status) return "Não informado";
  return EDITAL_STATUS_LABELS[status] ?? status;
}

type Row = Record<string, unknown>;

function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Aceita array, JSON de array, ou texto (um item por linha / separado por ";"). */
export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" ? item : asText((item as Row)?.text ?? (item as Row)?.label),
      )
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .map((item) => item.trim());
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        return asStringArray(JSON.parse(trimmed));
      } catch {
        // não é JSON: segue como texto
      }
    }
    return trimmed
      .split(/\r?\n|;/)
      .map((item) => item.replace(/^[-•*]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function asLinks(value: unknown): EditalLink[] {
  const items = typeof value === "string" ? (safeJson(value) ?? value.split(/\s+/)) : value;
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index): EditalLink | null => {
      if (typeof item === "string") return { label: `Link ${index + 1}`, url: item };
      const url = asText((item as Row)?.url);
      if (!url) return null;
      return { label: asText((item as Row)?.label) ?? `Link ${index + 1}`, url };
    })
    .filter((link): link is EditalLink => link !== null && isSafeUrl(link.url));
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function toEdital(row: Row): Edital {
  const officialUrl = asText(row.official_url);
  return {
    id: String(row.id),
    title: asText(row.title) ?? "Edital sem título",
    agency: asText(row.agency),
    status: normalizeCode(asText(row.status)),
    deadline: asText(row.deadline),
    totalAmount: asNumber(row.total_amount),
    maxAmountPerProject: asNumber(row.max_amount_per_project),
    summary: asText(row.summary),
    eligibilityCriteria: asStringArray(row.eligibility_criteria),
    categories: asStringArray(row.categories),
    requiredDocuments: asStringArray(row.required_documents),
    officialUrl: officialUrl && isSafeUrl(officialUrl) ? officialUrl : null,
    officialLinks: asLinks(row.official_links),
    acceptedFormats: asStringArray(row.accepted_formats),
    acceptedGenres: asStringArray(row.accepted_genres),
    acceptedStages: asStringArray(row.accepted_stages),
    minBudget: asNumber(row.min_budget),
    maxBudget: asNumber(row.max_budget),
    reviewStatus: normalizeCode(asText(row.review_status)),
    origin: asText(row.origin) ?? "manual",
    sourceId: asText(row.source_id),
    discoveredAt: asText(row.discovered_at),
    eligibleTerritories: asStringArray(row.eligible_territories),
    triageReason: asText(row.triage_reason),
    // Antes da migração de elegibilidade a coluna não existe: "não confirmada".
    eligibilityStatus: isEligibilityStatus(row.eligibility_status)
      ? row.eligibility_status
      : "not_confirmed",
    eligibilityReason: asText(row.eligibility_reason),
    eligibilityEvidence: asText(row.eligibility_evidence),
    eligibilitySource: row.eligibility_source === "manual" ? "manual" : "auto",
    pageType:
      row.page_type === "opportunity" || row.page_type === "uncertain" ? row.page_type : null,
    opportunityKind: (OPPORTUNITY_KINDS as readonly unknown[]).includes(row.opportunity_kind)
      ? (row.opportunity_kind as OpportunityKind)
      : null,
    pageTypeReasons: asStringArray(row.page_type_reasons),
  };
}

/** Ordem da listagem: abertos por prazo mais próximo → sem prazo → encerrados (mais recentes primeiro). */
export function compareEditais(a: Edital, b: Edital, now: Date = new Date()): number {
  const group = (edital: Edital) => {
    const deadline = parseDeadline(edital.deadline);
    if ((edital.status && CLOSED_STATUSES.has(edital.status)) || (deadline && deadline < now))
      return 2;
    return deadline ? 0 : 1;
  };
  const byGroup = group(a) - group(b);
  if (byGroup !== 0) return byGroup;
  const da = parseDeadline(a.deadline)?.getTime() ?? 0;
  const db = parseDeadline(b.deadline)?.getTime() ?? 0;
  return group(a) === 2 ? db - da : da - db;
}
