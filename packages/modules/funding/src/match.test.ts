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
    expect(result.attention).toHaveLength(4);
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
