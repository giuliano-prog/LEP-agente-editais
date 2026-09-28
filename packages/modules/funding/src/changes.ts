/**
 * Detecção de alterações e retificações (etapa 10), sem IA.
 *
 * Compara os valores atuais do edital com uma nova extração (página/regulamento
 * baixados de novo). O resultado é uma PROPOSTA para a equipe: nada é
 * sobrescrito automaticamente.
 */
import type { Edital } from "./edital";
import type { ExtractedFields, FieldKey } from "./extract";
import { FIELD_LABELS } from "./extract";
import { normalize } from "./territory";

export type FieldChange = {
  field: FieldKey;
  label: string;
  before: unknown;
  after: unknown;
  /** Trecho que fundamenta o valor novo. */
  snippet: string | null;
  source: "page" | "pdf" | null;
};

/** Valor atual de cada campo no edital (colunas ou, na falta, a evidência gravada). */
function currentValue(edital: Edital, field: FieldKey): unknown {
  switch (field) {
    case "deadline":
      return edital.deadline ? edital.deadline.slice(0, 10) : null;
    case "totalAmount":
      return edital.totalAmount;
    case "maxAmountPerProject":
      return edital.maxAmountPerProject;
    case "formats":
      return edital.acceptedFormats.length ? edital.acceptedFormats : null;
    case "genres":
      return edital.acceptedGenres.length ? edital.acceptedGenres : null;
    case "stages":
      return edital.acceptedStages.length ? edital.acceptedStages : null;
    default:
      return edital.fieldEvidence[field]?.value ?? null;
  }
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(Array.isArray(a) ? [...a].sort() : a) ===
  JSON.stringify(Array.isArray(b) ? [...b].sort() : b);

/**
 * Campos com valor NOVO encontrado e diferente do atual. Campo que "sumiu" do
 * texto não conta como alteração (evita falso alarme por página incompleta).
 */
export function diffFields(edital: Edital, fields: ExtractedFields): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of Object.keys(FIELD_LABELS) as FieldKey[]) {
    const found = fields[field];
    if (!found) continue;
    const before = currentValue(edital, field);
    if (same(before, found.value)) continue;
    changes.push({
      field,
      label: FIELD_LABELS[field],
      before,
      after: found.value,
      snippet: found.evidence.snippet,
      source: found.evidence.source,
    });
  }
  return changes;
}

const RECTIFICATION =
  /\b(retifica\w*|errata|aditivo|republica\w*|prorroga\w*|alteracao do edital)\b/;

/** Link/título de retificação, errata, aditivo, republicação ou prorrogação. */
export function isRectification(label: string, url = ""): boolean {
  let path = "";
  try {
    path = url ? decodeURIComponent(new URL(url).pathname) : "";
  } catch {
    path = "";
  }
  return RECTIFICATION.test(normalize(`${label} ${path.replace(/[-_/]+/g, " ")}`));
}

/** Resumo em pt-BR para a lista de alterações. */
export function changeSummary(changes: FieldChange[], rectifications: number): string {
  const parts: string[] = [];
  if (rectifications > 0) parts.push(`${rectifications} retificação(ões)/errata(s) nova(s)`);
  if (changes.length > 0)
    parts.push(`alteração em: ${changes.map((change) => change.label).join(", ")}`);
  return parts.length > 0
    ? `${parts.join("; ")}.`.replace(/^./, (char) => char.toUpperCase())
    : "Sem alterações nos campos extraídos.";
}

/** Colunas de core.editais para aplicar os valores novos (decisão da equipe). */
export type ChangeColumns = {
  deadline?: string;
  total_amount?: number;
  max_amount_per_project?: number;
  accepted_formats?: string[];
  accepted_genres?: string[];
  accepted_stages?: string[];
};

export function changeColumns(changes: FieldChange[]): ChangeColumns {
  const columns: ChangeColumns = {};
  for (const change of changes) {
    switch (change.field) {
      case "deadline":
        columns.deadline = `${change.after}T23:59:00-03:00`;
        break;
      case "totalAmount":
        columns.total_amount = Number(change.after);
        break;
      case "maxAmountPerProject":
        columns.max_amount_per_project = Number(change.after);
        break;
      case "formats":
        columns.accepted_formats = change.after as string[];
        break;
      case "genres":
        columns.accepted_genres = change.after as string[];
        break;
      case "stages":
        columns.accepted_stages = change.after as string[];
        break;
      default:
        break;
    }
  }
  return columns;
}
