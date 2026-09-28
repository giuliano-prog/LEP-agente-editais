import { describe, expect, it } from "vitest";
import { MATCH_DISCLAIMER, matchProject, matchProjects, type MatchProject } from "./match";
import { toEdital } from "./edital";

const now = new Date("2026-09-26T12:00:00-03:00");

const edital = toEdital({
  id: "e1",
  title: "Edital Exemplo de Longa-Metragem",
  status: "open",
  deadline: "2026-11-30",
  review_status: "validated",
  eligible_territories: ["BR"],
  accepted_formats: ["feature_film"],
  accepted_genres: ["fiction", "documentary"],
  accepted_stages: ["development", "production"],
  min_budget: 500000,
  max_budget: 5000000,
});

const project: MatchProject = {
  id: "p1",
  title: "Projeto Exemplo",
  format: "feature_film",
  genre: "documentary",
  stage: "production",
  budget: 2000000,
};

describe("matchProject", () => {
  it("projeto que atende todas as regras objetivas é compatível", () => {
    const result = matchProject(edital, project, now);
    expect(result.verdict).toBe("compatible");
    expect(result.unmet).toHaveLength(0);
    expect(result.attention).toHaveLength(0);
    expect(result.met.map((item) => item.criterion)).toEqual([
      "Prazo de inscrição",
      "Território (sede da LEP)",
      "Formato",
      "Gênero / tipologia",
      "Estágio do projeto",
      "Faixa de orçamento",
    ]);
  });

  it("formato e orçamento fora da regra tornam o projeto incompatível, com explicação", () => {
    const result = matchProject(edital, { ...project, format: "short_film", budget: 100000 }, now);
    expect(result.verdict).toBe("incompatible");
    expect(result.unmet.map((item) => item.criterion)).toEqual(["Formato", "Faixa de orçamento"]);
    expect(result.unmet[0]?.detail).toContain("Curta-metragem");
    expect(result.unmet[0]?.detail).toContain("Longa-metragem");
  });

  it("dados ausentes viram pontos de atenção, nunca reprovação", () => {
    const result = matchProject(edital, { ...project, genre: null, budget: null }, now);
    expect(result.verdict).toBe("compatible_with_pending");
    expect(result.unmet).toHaveLength(0);
    expect(result.attention.map((item) => item.criterion)).toEqual([
      "Gênero / tipologia",
      "Faixa de orçamento",
    ]);
  });

  it("restrições não registradas no edital viram pontos de atenção", () => {
    const bare = toEdital({
      id: "e2",
      title: "Sem regras",
      status: "open",
      deadline: "2026-12-31",
      review_status: "validated",
    });
    const result = matchProject(bare, project, now);
    expect(result.verdict).toBe("compatible_with_pending");
    // formato, gênero, estágio, orçamento e território não registrados
    expect(result.attention).toHaveLength(5);
  });

  it("critérios textuais e documentos exigidos viram pendências para verificação humana", () => {
    const withText = {
      ...edital,
      eligibilityCriteria: ["Proponente sediado no RJ"],
      requiredDocuments: ["CND federal"],
    };
    const result = matchProject(withText, project, now);
    expect(result.verdict).toBe("compatible_with_pending");
    expect(result.attention).toEqual([
      { criterion: "Verificar manualmente", detail: "Proponente sediado no RJ" },
      { criterion: "Documento pendente", detail: "CND federal" },
    ]);
  });

  it("edital não revisado gera aviso de resultado preliminar", () => {
    const result = matchProject({ ...edital, reviewStatus: "pending" }, project, now);
    expect(result.attention[0]?.criterion).toBe("Revisão do edital");
  });

  it("prazo: encerrado, próximo e status fechado", () => {
    expect(
      matchProject({ ...edital, deadline: "2026-09-20" }, project, now).unmet[0]?.criterion,
    ).toBe("Prazo de inscrição");
    const soon = matchProject({ ...edital, deadline: "2026-09-30" }, project, now);
    expect(soon.attention[0]?.detail).toContain("dia(s) restantes");
    expect(matchProject({ ...edital, status: "closed" }, project, now).verdict).toBe(
      "incompatible",
    );
  });

  it("prazo em data simples vale até 23h59 de Brasília do próprio dia", () => {
    const lastDay = new Date("2026-11-30T22:00:00-03:00");
    expect(matchProject(edital, project, lastDay).unmet).toHaveLength(0);
  });
});

describe("território (diretrizes LEP 1 e 2)", () => {
  it("edital exclusivo de outro estado: não atende, com explicação", () => {
    const result = matchProject(
      { ...edital, eligibleTerritories: ["RJ:Rio de Janeiro"] },
      project,
      now,
    );
    expect(result.verdict).toBe("incompatible");
    expect(result.unmet[0]).toEqual({
      criterion: "Território (sede da LEP)",
      detail: "Exclusivo para Município de Rio de Janeiro/RJ; a LEP é sediada em São Paulo/SP.",
    });
  });

  it("edital de SP: atende", () => {
    const result = matchProject({ ...edital, eligibleTerritories: ["SP"] }, project, now);
    expect(result.met.map((item) => item.criterion)).toContain("Território (sede da LEP)");
  });

  it("sede do proponente não cadastrada: ponto de atenção", () => {
    const result = matchProject({ ...edital, eligibleTerritories: ["SP"] }, project, now, {
      state: null,
      city: null,
    });
    expect(result.attention.map((item) => item.criterion)).toContain("Território (sede da LEP)");
  });
});

describe("matchProjects", () => {
  it("ordena compatíveis antes dos incompatíveis", () => {
    const results = matchProjects(
      edital,
      [{ ...project, id: "bad", format: "series" }, project],
      now,
    );
    expect(results.map((result) => result.projectId)).toEqual(["p1", "bad"]);
  });
});

describe("MATCH_DISCLAIMER", () => {
  it("nunca promete aprovação", () => {
    expect(MATCH_DISCLAIMER).toContain("Não representa previsão ou garantia de aprovação");
  });
});

describe("Match v2 — aderência explicável por fatores", () => {
  it("tudo atendido → 100 pontos, confiança total, nível alto, fatores com peso e motivo", () => {
    const result = matchProject(edital, project, now);
    expect(result).toMatchObject({ score: 100, confidence: 1, level: "high", blockers: [] });
    expect(result.factors.map((factor) => [factor.key, factor.weight, factor.state])).toEqual([
      ["format", 25, "met"],
      ["deadline", 20, "met"],
      ["stage", 20, "met"],
      ["budget", 20, "met"],
      ["genre", 15, "met"],
    ]);
    expect(result.factors[0]!.detail).toContain("aceito pelo edital");
  });

  it("fator não atendido reduz a pontuação proporcionalmente ao peso", () => {
    const result = matchProject(edital, { ...project, format: "short_film" }, now);
    expect(result.score).toBe(75);
    expect(result.level).toBe("high");
    expect(
      matchProject(edital, { ...project, format: "series", stage: "distribution" }, now),
    ).toMatchObject({
      score: 55,
      level: "medium",
    });
  });

  it("prazo próximo vale metade do peso", () => {
    const soon = toEdital({
      ...edital,
      id: "e2",
      deadline: "2026-09-30",
      review_status: "validated",
    });
    expect(
      matchProject(soon, project, now).factors.find((factor) => factor.key === "deadline"),
    ).toMatchObject({
      state: "partial",
    });
  });

  it("pouca informação no edital → 'dados insuficientes' (incerteza não vira baixa)", () => {
    const vago = toEdital({
      id: "e3",
      title: "Edital vago",
      review_status: "validated",
      eligible_territories: ["BR"],
    });
    const result = matchProject(vago, project, now);
    expect(result.level).toBe("insufficient");
    expect(result.confidence).toBeLessThan(0.4);
    expect(result.factors.every((factor) => factor.state === "unknown")).toBe(true);
  });

  it("impedimentos (território, elegibilidade, encerrado) forçam nível baixo, com o motivo", () => {
    const rj = toEdital({ ...edital, id: "e4", eligible_territories: ["RJ"] });
    expect(matchProject(rj, project, now)).toMatchObject({ level: "low" });
    expect(matchProject(rj, project, now).blockers[0]).toContain("Território (sede da LEP)");

    const pf = toEdital({
      ...edital,
      id: "e5",
      eligibility_status: "individual",
      eligibility_reason: "Destinado a pessoas físicas.",
    });
    const result = matchProject(pf, project, now);
    expect(result.level).toBe("low");
    expect(result.unmet.map((item) => item.criterion)).toContain("Elegibilidade da LEP");
    expect(result.blockers[0]).toContain("Pessoa física");

    const closed = toEdital({ ...edital, id: "e6", status: "closed" });
    expect(matchProject(closed, project, now).level).toBe("low");
  });

  it("necessita revisão → ponto de atenção (não impedimento)", () => {
    const review = toEdital({ ...edital, id: "e7", eligibility_status: "needs_review" });
    const result = matchProject(review, project, now);
    expect(result.attention.map((item) => item.criterion)).toContain("Elegibilidade da LEP");
    expect(result.blockers).toEqual([]);
  });

  it("matchProjects ordena por nível e pontuação", () => {
    const results = matchProjects(
      edital,
      [
        { ...project, id: "baixo", format: "series", stage: "distribution", genre: "animation" },
        { ...project, id: "alto" },
        { ...project, id: "medio", format: "series", stage: "distribution" },
      ],
      now,
    );
    expect(results.map((result) => result.projectId)).toEqual(["alto", "medio", "baixo"]);
  });

  it("aviso de que não é previsão de aprovação continua obrigatório", () => {
    expect(MATCH_DISCLAIMER).toContain("Não representa previsão ou garantia de aprovação");
  });
});
