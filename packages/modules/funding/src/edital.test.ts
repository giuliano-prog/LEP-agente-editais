import { describe, expect, it } from "vitest";
import {
  asStringArray,
  compareEditais,
  editalStatusLabel,
  parseDeadline,
  toEdital,
} from "./edital";

describe("toEdital", () => {
  it("normaliza tipos variados vindos do banco", () => {
    const edital = toEdital({
      id: 10,
      title: "  Edital X ",
      total_amount: "1500000.00",
      categories: "Longa\nSérie",
      eligibility_criteria: '["Critério A", "Critério B"]',
      official_links: [
        { label: "Página oficial", url: "https://exemplo.gov.br/edital" },
        { label: "Malicioso", url: "javascript:alert(1)" },
      ],
      official_url: "ftp://exemplo",
    });
    expect(edital.id).toBe("10");
    expect(edital.title).toBe("Edital X");
    expect(edital.totalAmount).toBe(1500000);
    expect(edital.categories).toEqual(["Longa", "Série"]);
    expect(edital.eligibilityCriteria).toEqual(["Critério A", "Critério B"]);
    expect(edital.officialLinks).toEqual([
      { label: "Página oficial", url: "https://exemplo.gov.br/edital" },
    ]);
    expect(edital.officialUrl).toBeNull();
  });

  it("converte status em português para os códigos internos", () => {
    expect(toEdital({ id: 1, status: "Aberto", review_status: "validado" })).toMatchObject({
      status: "open",
      reviewStatus: "validated",
    });
    expect(toEdital({ id: 1, status: "Encerrado" }).status).toBe("closed");
  });

  it("usa valores padrão seguros para campos ausentes", () => {
    const edital = toEdital({ id: "a" });
    expect(edital.title).toBe("Edital sem título");
    expect(edital.categories).toEqual([]);
    expect(edital.totalAmount).toBeNull();
  });
});

describe("asStringArray", () => {
  it("aceita listas com marcadores e separadas por ponto e vírgula", () => {
    expect(asStringArray("- item 1\n• item 2; item 3")).toEqual(["item 1", "item 2", "item 3"]);
  });
});

describe("parseDeadline / editalStatusLabel", () => {
  it("interpreta data simples como fim do dia em Brasília", () => {
    expect(parseDeadline("2026-10-10")?.toISOString()).toBe("2026-10-11T02:59:59.000Z");
    expect(parseDeadline("não é data")).toBeNull();
  });

  it("traduz status conhecidos e preserva desconhecidos", () => {
    expect(editalStatusLabel("open")).toBe("Inscrições abertas");
    expect(editalStatusLabel("aberto")).toBe("aberto");
    expect(editalStatusLabel(null)).toBe("Não informado");
  });
});

describe("compareEditais", () => {
  it("abertos por prazo, depois sem prazo, depois encerrados", () => {
    const now = new Date("2026-09-26T12:00:00-03:00");
    const editais = [
      toEdital({ id: "encerrado", deadline: "2026-09-01" }),
      toEdital({ id: "sem-prazo" }),
      toEdital({ id: "longe", deadline: "2026-12-01" }),
      toEdital({ id: "perto", deadline: "2026-10-01" }),
      toEdital({ id: "fechado", status: "closed", deadline: "2026-12-31" }),
    ];
    expect(editais.sort((a, b) => compareEditais(a, b, now)).map((e) => e.id)).toEqual([
      "perto",
      "longe",
      "sem-prazo",
      "fechado",
      "encerrado",
    ]);
  });

  it("origem padrão é manual; lê origem da varredura", () => {
    expect(toEdital({ id: 1 }).origin).toBe("manual");
    expect(toEdital({ id: 1, origin: "monitor", review_status: "Descartado" })).toMatchObject({
      origin: "monitor",
      reviewStatus: "discarded",
    });
  });
});

describe("toEdital — elegibilidade (terceiro eixo)", () => {
  it("lê status, motivo, evidência e origem", () => {
    const edital = toEdital({
      id: 1,
      eligibility_status: "territorial_restriction",
      eligibility_reason: "Exclusivo de outro município.",
      eligibility_evidence: "sediadas no municipio x",
      eligibility_source: "manual",
    });
    expect(edital).toMatchObject({
      eligibilityStatus: "territorial_restriction",
      eligibilityReason: "Exclusivo de outro município.",
      eligibilityEvidence: "sediadas no municipio x",
      eligibilitySource: "manual",
    });
  });

  it("sem a coluna (antes da migração) ou valor desconhecido → não confirmada, automática", () => {
    expect(toEdital({ id: 1 })).toMatchObject({
      eligibilityStatus: "not_confirmed",
      eligibilitySource: "auto",
    });
    expect(toEdital({ id: 1, eligibility_status: "talvez" }).eligibilityStatus).toBe(
      "not_confirmed",
    );
  });
});
