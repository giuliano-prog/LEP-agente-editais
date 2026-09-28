import type { SourceResult } from "./run";

export type SourceSummary = Omit<SourceResult, "sourceId" | "candidates" | "linksFound">;

/** Totais + detalhe por fonte de uma execução da varredura. */
export type MonitorSummary = {
  sourcesChecked: number;
  totals: Pick<
    SourceResult,
    | "found"
    | "imported"
    | "updated"
    | "duplicates"
    | "rejected"
    | "pendingReview"
    | "blockedByRobots"
    | "failed"
  > & { sourcesWithError: number };
  sources: SourceSummary[];
};

export function summarize(results: SourceResult[]): MonitorSummary {
  const sum = (key: keyof MonitorSummary["totals"] & keyof SourceResult) =>
    results.reduce((total, result) => total + (result[key] as number), 0);
  return {
    sourcesChecked: results.length,
    totals: {
      found: sum("found"),
      imported: sum("imported"),
      updated: sum("updated"),
      duplicates: sum("duplicates"),
      rejected: sum("rejected"),
      pendingReview: sum("pendingReview"),
      blockedByRobots: sum("blockedByRobots"),
      failed: sum("failed"),
      sourcesWithError: results.filter((result) => result.status !== "ok").length,
    },
    sources: results.map((result) => {
      const rest: Partial<SourceResult> = { ...result };
      delete rest.sourceId;
      delete rest.candidates;
      delete rest.linksFound;
      return rest as SourceSummary;
    }),
  };
}
