import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport, evaluateCase, EVALUATORS } from "./evaluate";
import { loadCases } from "./load-cases";

const examples = join(import.meta.dirname, "cases");

describe("benchmark de editais", () => {
  it("carrega os exemplos versionados: todos fictícios e válidos", () => {
    const { cases, errors } = loadCases([examples]);
    expect(errors).toEqual([]);
    expect(cases.length).toBeGreaterThanOrEqual(5);
    expect(cases.every((item) => item.fictitious)).toBe(true);
  });

  it("recusa caso inválido e id repetido, com mensagem por arquivo", () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-"));
    const valid = {
      id: "caso-a",
      fictitious: true,
      origin: "teste",
      referenceDate: "2026-09-28",
      input: { title: "Edital", url: "https://a.exemplo.org/editais/x/" },
      expected: { deadline: null },
    };
    writeFileSync(
      join(dir, "a.json"),
      JSON.stringify([valid, valid, { ...valid, id: "caso-b", expected: {} }]),
    );
    writeFileSync(join(dir, "b.json"), "{");
    const { cases, errors } = loadCases([dir]);
    expect(cases).toHaveLength(1);
    expect(errors).toEqual([
      'a.json[1]: id repetido "caso-a"',
      "a.json[2]: expected — expected: informe ao menos um campo",
      "b.json: JSON inválido",
    ]);
  });

  it("avalia só os campos esperados; campo sem avaliador nunca conta como acerto", () => {
    const { cases } = loadCases([examples]);
    // Simula um campo ainda sem avaliador.
    const withoutEligibility = { ...EVALUATORS, eligibility: undefined };
    const report = buildReport(
      cases,
      cases.flatMap((item) => evaluateCase(item, withoutEligibility)),
    );
    const eligibility = report.fields.find((stats) => stats.field === "eligibility");
    expect(eligibility).toMatchObject({ evaluated: 0, hits: 0, accuracy: null });
    expect(eligibility!.noEvaluator).toBeGreaterThan(0);
    expect(report.realCases).toBe(0);
  });

  it("elegibilidade (etapa 5): exemplos fictícios classificados sem erro grave", () => {
    const { cases } = loadCases([examples]);
    const report = buildReport(
      cases,
      cases.flatMap((item) => evaluateCase(item)),
    );
    expect(report.fields.find((stats) => stats.field === "eligibility")).toMatchObject({
      noEvaluator: 0,
      critical: 0,
      accuracy: 1,
    });
  });

  it("marca como erro grave descartar por território o que a pessoa não marcou inelegível", () => {
    const { cases } = loadCases([examples]);
    const uncertain = cases.find((item) => item.id === "exemplo-sem-informacao-territorial")!;
    const [outcome] = evaluateCase(
      { ...uncertain, expected: { territory: "unknown" } },
      { territory: () => "ineligible" },
    );
    expect(outcome).toMatchObject({ result: "miss", critical: true });
  });

  it("classificador (etapa 6) resolve o problema conhecido da página genérica", () => {
    const { cases } = loadCases([examples]);
    const generic = cases.find((item) => item.id === "exemplo-pagina-generica")!;
    expect(evaluateCase(generic)).toEqual([
      expect.objectContaining({ field: "isOpportunity", result: "hit" }),
      expect.objectContaining({ field: "pageType", result: "hit", actual: "institutional" }),
    ]);
  });
});
