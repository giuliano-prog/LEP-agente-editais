import { describe, expect, it } from "vitest";
import {
  editalFormToInput,
  editalInputSchema,
  parseLines,
  parseMoney,
  toDeadlineIso,
} from "./edital-input";

describe("parseMoney", () => {
  it.each([
    ["R$ 1.500.000,50", 1500000.5],
    ["1500000.50", 1500000.5],
    ["1.500.000", 1500000],
    ["2000000", 2000000],
    ["", null],
  ])("%s → %s", (raw, expected) => {
    expect(parseMoney(raw)).toBe(expected);
  });

  it("marca valores inválidos", () => {
    expect(Number.isNaN(parseMoney("abc"))).toBe(true);
  });
});

describe("parseLines / toDeadlineIso", () => {
  it("separa um item por linha, remove marcadores e duplicados", () => {
    expect(parseLines("- Item A\n\n• Item B\nItem A\r\n  Item C  ")).toEqual([
      "Item A",
      "Item B",
      "Item C",
    ]);
  });

  it("usa 23:59 de Brasília quando a hora não é informada", () => {
    expect(toDeadlineIso("2026-11-30", "")).toBe("2026-11-30T23:59:00-03:00");
    expect(toDeadlineIso("2026-11-30", "18:00")).toBe("2026-11-30T18:00:00-03:00");
    expect(toDeadlineIso("", "")).toBeNull();
    expect(toDeadlineIso("30/11/2026", "")).toBe("invalid");
  });
});

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("territórios no formulário", () => {
  it("combina opções marcadas e outros territórios digitados", () => {
    const result = editalInputSchema.parse(
      editalFormToInput(
        form([
          ["title", "Edital X"],
          ["eligible_territories", "SP"],
          ["other_territories", "rj\nMG:Belo Horizonte\nsp"],
        ]),
      ),
    );
    expect(result.eligible_territories).toEqual(["SP", "RJ", "MG:Belo Horizonte"]);
  });

  it("rejeita códigos inválidos", () => {
    const result = editalInputSchema.safeParse(
      editalFormToInput(
        form([
          ["title", "Edital X"],
          ["other_territories", "Rio de Janeiro"],
        ]),
      ),
    );
    expect(result.error?.issues[0]?.message).toContain("Território inválido");
  });
});

describe("editalInputSchema", () => {
  it("converte o formulário completo", () => {
    const input = editalFormToInput(
      form([
        ["title", "  Edital Exemplo  "],
        ["status", "open"],
        ["deadline_date", "2026-11-30"],
        ["total_amount", "R$ 10.000.000,00"],
        ["min_budget", "500.000"],
        ["max_budget", "8.000.000"],
        ["eligibility_criteria", "Critério 1\nCritério 2"],
        ["official_url", "https://exemplo.gov.br/edital"],
        ["accepted_formats", "feature_film"],
        ["accepted_formats", "invalido"],
        ["accepted_stages", "production"],
        ["reviewed", "on"],
      ]),
    );
    const result = editalInputSchema.parse(input);
    expect(result).toMatchObject({
      title: "Edital Exemplo",
      status: "open",
      deadline: "2026-11-30T23:59:00-03:00",
      total_amount: 10000000,
      min_budget: 500000,
      max_budget: 8000000,
      eligibility_criteria: ["Critério 1", "Critério 2"],
      accepted_formats: ["feature_film"],
      accepted_stages: ["production"],
      agency: null,
      review_status: "validated",
    });
  });

  it("sem confirmação explícita, o edital fica com revisão pendente", () => {
    const result = editalInputSchema.parse(editalFormToInput(form([["title", "Edital X"]])));
    expect(result.review_status).toBe("pending");
  });

  it("rejeita dados inválidos com mensagens claras", () => {
    const invalid = (entries: [string, string][]) =>
      editalInputSchema.safeParse(editalFormToInput(form(entries)));
    expect(invalid([["title", "a"]]).error?.issues[0]?.message).toBe("Informe o título do edital.");
    expect(
      invalid([
        ["title", "Edital"],
        ["total_amount", "muito"],
      ]).success,
    ).toBe(false);
    expect(
      invalid([
        ["title", "Edital"],
        ["official_url", "javascript:alert(1)"],
      ]).success,
    ).toBe(false);
    expect(
      invalid([
        ["title", "Edital"],
        ["min_budget", "900"],
        ["max_budget", "100"],
      ]).error?.issues[0]?.message,
    ).toContain("mínimo não pode ser maior");
  });
});
