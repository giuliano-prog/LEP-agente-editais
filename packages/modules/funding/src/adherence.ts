import type { MatchResult } from "./match";

/**
 * Aderência do edital à carteira da LEP: o melhor resultado de Match entre os
 * projetos cadastrados. Indica compatibilidade técnica, nunca chance de aprovação.
 */
export type AdherenceLevel = "high" | "medium" | "low" | "insufficient" | "none";

export const ADHERENCE_LABELS: Record<AdherenceLevel, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  insufficient: "Dados insuficientes",
  none: "Sem projetos",
};

export type Adherence = {
  level: AdherenceLevel;
  /** Pontuação (0–100) e confiança (0–1) do melhor projeto (Match v2). */
  score: number | null;
  confidence: number;
  /** O melhor projeto tem impedimento (elegibilidade, território, prazo encerrado). */
  blocked: boolean;
  best: MatchResult | null;
  compatibleProjects: number;
  totalProjects: number;
};

/** Espera resultados já ordenados por `matchProjects` (melhor primeiro). */
export function summarizeAdherence(results: MatchResult[]): Adherence {
  const best = results[0] ?? null;
  return {
    level: best ? best.level : "none",
    score: best?.score ?? null,
    confidence: best?.confidence ?? 0,
    blocked: (best?.blockers.length ?? 0) > 0,
    best,
    compatibleProjects: results.filter((result) => result.verdict !== "incompatible").length,
    totalProjects: results.length,
  };
}
