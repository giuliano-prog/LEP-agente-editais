import type { MatchResult, MatchVerdict } from "./match";

/**
 * Aderência do edital à carteira da LEP: o melhor resultado de Match entre os
 * projetos cadastrados. Indica compatibilidade técnica, nunca chance de aprovação.
 */
export type AdherenceLevel = "high" | "medium" | "low" | "none";

export const ADHERENCE_LABELS: Record<AdherenceLevel, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Sem projetos",
};

const LEVEL_BY_VERDICT: Record<MatchVerdict, AdherenceLevel> = {
  compatible: "high",
  compatible_with_pending: "medium",
  incompatible: "low",
};

export type Adherence = {
  level: AdherenceLevel;
  best: MatchResult | null;
  compatibleProjects: number;
  totalProjects: number;
};

/** Espera resultados já ordenados por `matchProjects` (melhor primeiro). */
export function summarizeAdherence(results: MatchResult[]): Adherence {
  const best = results[0] ?? null;
  return {
    level: best ? LEVEL_BY_VERDICT[best.verdict] : "none",
    best,
    compatibleProjects: results.filter((result) => result.verdict !== "incompatible").length,
    totalProjects: results.length,
  };
}
