import {
  assessEligibility,
  classifyPage,
  IMPORTABLE_PAGE_TYPES,
  assessTerritory,
  findDeadline,
  findTotalAmount,
  selectCandidates,
  statusFromDeadline,
} from "../src/index";
import type { BenchmarkCase, ExpectedField } from "./case-schema";

/**
 * Avaliadores: o que o motor ATUAL responde para cada campo esperado.
 * Campos sem avaliador aparecem como
 * "sem avaliador" no relatório — nunca como acerto.
 * Nada aqui é usado pelo código de produção.
 */
export type Evaluator = (item: BenchmarkCase) => unknown;

const pageOf = (item: BenchmarkCase) =>
  classifyPage({
    title: item.input.title,
    url: item.input.url,
    text: [item.input.text, item.input.pdfText ?? ""].join("\n"),
  });

const fullText = (item: BenchmarkCase) =>
  [item.input.title, item.input.text, item.input.pdfText ?? ""].join("\n");

export const EVALUATORS: Partial<Record<ExpectedField, Evaluator>> = {
  // Link aceito pela seleção E página classificada como oportunidade/incerta (etapa 6).
  isOpportunity: (item) => {
    const url = new URL(item.input.url);
    const linkAccepted =
      selectCandidates(
        [{ text: item.input.title, url: item.input.url }],
        {
          listUrl: `${url.origin}/`,
          audiovisualOnly: item.input.audiovisualSource,
          linkContains: null,
        },
        new Set(),
        1,
      ).length > 0;
    return linkAccepted && IMPORTABLE_PAGE_TYPES.has(pageOf(item).type);
  },
  pageType: (item) => pageOf(item).type,
  territory: (item) => assessTerritory(fullText(item)).verdict,
  eligibility: (item) => assessEligibility(fullText(item)).status,
  deadline: (item) => findDeadline(fullText(item))?.slice(0, 10) ?? null,
  totalAmount: (item) => findTotalAmount(fullText(item)),
  status: (item) => {
    const deadline = findDeadline(fullText(item));
    return statusFromDeadline(deadline?.slice(0, 10) ?? null, item.referenceDate);
  },
};

export type FieldOutcome = {
  caseId: string;
  field: ExpectedField;
  expected: unknown;
  actual: unknown;
  result: "hit" | "miss" | "no_evaluator";
  /** Erro grave: o motor descartaria algo que a pessoa não considerou inelegível. */
  critical: boolean;
};

export function evaluateCase(
  item: BenchmarkCase,
  evaluators: Partial<Record<ExpectedField, Evaluator>> = EVALUATORS,
): FieldOutcome[] {
  return (Object.entries(item.expected) as [ExpectedField, unknown][])
    .filter(([, expected]) => expected !== undefined)
    .map(([field, expected]) => {
      const evaluator = evaluators[field];
      if (!evaluator) {
        return {
          caseId: item.id,
          field,
          expected,
          actual: null,
          result: "no_evaluator",
          critical: false,
        };
      }
      const actual = evaluator(item);
      const hit = JSON.stringify(actual ?? null) === JSON.stringify(expected ?? null);
      const critical =
        !hit &&
        ((field === "territory" && actual === "ineligible") ||
          (field === "isOpportunity" && expected === true && actual === false) ||
          (field === "eligibility" &&
            (actual === "not_eligible" || actual === "territorial_restriction")));
      return { caseId: item.id, field, expected, actual, result: hit ? "hit" : "miss", critical };
    });
}

export type FieldStats = {
  field: ExpectedField;
  evaluated: number;
  hits: number;
  misses: number;
  noEvaluator: number;
  critical: number;
  accuracy: number | null;
};

export type BenchmarkReport = {
  cases: number;
  realCases: number;
  fields: FieldStats[];
  failures: FieldOutcome[];
};

export function buildReport(items: BenchmarkCase[], outcomes: FieldOutcome[]): BenchmarkReport {
  const byField = new Map<ExpectedField, FieldOutcome[]>();
  for (const outcome of outcomes) {
    byField.set(outcome.field, [...(byField.get(outcome.field) ?? []), outcome]);
  }
  const fields = [...byField.entries()].map(([field, list]): FieldStats => {
    const hits = list.filter((o) => o.result === "hit").length;
    const misses = list.filter((o) => o.result === "miss").length;
    return {
      field,
      evaluated: hits + misses,
      hits,
      misses,
      noEvaluator: list.filter((o) => o.result === "no_evaluator").length,
      critical: list.filter((o) => o.critical).length,
      accuracy: hits + misses > 0 ? hits / (hits + misses) : null,
    };
  });
  return {
    cases: items.length,
    realCases: items.filter((item) => !item.fictitious).length,
    fields,
    failures: outcomes.filter((o) => o.result === "miss"),
  };
}
