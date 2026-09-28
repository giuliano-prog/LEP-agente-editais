import { describe, expect, it } from "vitest";
import { summarizeAdherence } from "./adherence";
import { toEdital } from "./edital";
import { matchProjects } from "./match";

const now = new Date("2026-09-26T12:00:00-03:00");
const edital = toEdital({
  id: "e1",
  status: "open",
  deadline: "2026-11-30",
  review_status: "validated",
  eligible_territories: ["SP"],
  accepted_formats: ["feature_film"],
  accepted_genres: ["documentary"],
  accepted_stages: ["production"],
  min_budget: 100,
  max_budget: 1e9,
});
const good = {
  id: "p1",
  title: "Doc",
  format: "feature_film",
  genre: "documentary",
  stage: "production",
  budget: 1e6,
};
const bad = {
  id: "p2",
  title: "Série",
  format: "series",
  genre: "fiction",
  stage: "development",
  budget: 1e6,
};

describe("summarizeAdherence", () => {
  it("usa o melhor projeto e conta os compatíveis", () => {
    const adherence = summarizeAdherence(matchProjects(edital, [bad, good], now));
    expect(adherence).toMatchObject({ level: "high", compatibleProjects: 1, totalProjects: 2 });
    expect(adherence.best?.projectTitle).toBe("Doc");
  });

  it("baixa quando nenhum projeto atende; sem projetos quando a carteira está vazia", () => {
    expect(summarizeAdherence(matchProjects(edital, [bad], now)).level).toBe("low");
    expect(summarizeAdherence([]).level).toBe("none");
  });
});

describe("summarizeAdherence — Match v2", () => {
  it("expõe pontuação, confiança e se o melhor projeto tem impedimento", () => {
    const edital = toEdital({
      id: "e",
      title: "Edital",
      status: "open",
      deadline: "2026-11-30",
      review_status: "validated",
      eligible_territories: ["RJ"],
      accepted_formats: ["feature_film"],
    });
    const adherence = summarizeAdherence(
      matchProjects(
        edital,
        [{ id: "p", title: "P", format: "feature_film", genre: null, stage: null, budget: null }],
        new Date("2026-09-28T12:00:00-03:00"),
      ),
    );
    expect(adherence).toMatchObject({ level: "low", blocked: true });
    expect(adherence.score).not.toBeNull();
    expect(summarizeAdherence([])).toMatchObject({ level: "none", score: null, blocked: false });
  });
});
