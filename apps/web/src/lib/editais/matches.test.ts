import { describe, expect, it } from "vitest";
import { matchProject, toEdital, LEP_HEADQUARTERS } from "@lep/funding";
import { inputsHash, matchRow } from "./matches";

const edital = toEdital({
  id: "e1",
  title: "Edital fictício",
  status: "open",
  deadline: "2026-11-30",
  review_status: "validated",
  eligible_territories: ["BR"],
  accepted_formats: ["feature_film"],
});
const project = {
  id: "p1",
  title: "Projeto",
  format: "feature_film",
  genre: null,
  stage: null,
  budget: null,
};
const now = new Date("2026-09-28T12:00:00-03:00");

describe("Match v2 persistido", () => {
  it("hash muda quando dados relevantes mudam e não muda com o título", () => {
    const base = inputsHash(edital, project, LEP_HEADQUARTERS);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(inputsHash({ ...edital, title: "Outro título" }, project, LEP_HEADQUARTERS)).toBe(base);
    expect(inputsHash(edital, { ...project, budget: 100 }, LEP_HEADQUARTERS)).not.toBe(base);
    expect(
      inputsHash({ ...edital, eligibilityStatus: "individual" }, project, LEP_HEADQUARTERS),
    ).not.toBe(base);
  });

  it("linha gravada: versão, pontuação, confiança, nível, fatores e impedimentos", () => {
    const result = matchProject(edital, project, now);
    const row = matchRow("org", "e1", result, "a".repeat(64), now);
    expect(row).toMatchObject({
      org_id: "org",
      edital_id: "e1",
      projeto_id: "p1",
      version: "v2",
      score: result.score,
      confidence: result.confidence,
      level: result.level,
      verdict: result.verdict,
      blockers: [],
      computed_at: now.toISOString(),
    });
    expect(row.factors.length).toBeGreaterThan(0);
  });
});
