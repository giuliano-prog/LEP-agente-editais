import { describe, expect, it } from "vitest";
import type { SourceResult } from "./run";
import { summarize } from "./summary";

const base: SourceResult = {
  sourceId: "s",
  name: "Fonte",
  status: "ok",
  linksFound: 10,
  found: 0,
  candidates: 0,
  imported: 0,
  updated: 0,
  duplicates: 0,
  rejected: 0,
  pendingReview: 0,
  blockedByRobots: 0,
  failed: 0,
};

describe("summarize", () => {
  it("soma os contadores e mantém o detalhe por fonte", () => {
    const summary = summarize([
      { ...base, name: "A", found: 5, imported: 2, pendingReview: 2, duplicates: 2, rejected: 1 },
      { ...base, name: "B", status: "error", error: "HTTP 404", failed: 1 },
    ]);
    expect(summary.sourcesChecked).toBe(2);
    expect(summary.totals).toEqual({
      found: 5,
      imported: 2,
      updated: 0,
      duplicates: 2,
      rejected: 1,
      pendingReview: 2,
      blockedByRobots: 0,
      failed: 1,
      sourcesWithError: 1,
    });
    expect(summary.sources[1]).toMatchObject({ name: "B", status: "error", error: "HTTP 404" });
    expect(summary.sources[0]).not.toHaveProperty("sourceId");
  });
});
