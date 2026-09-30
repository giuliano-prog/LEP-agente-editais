import { describe, expect, it } from "vitest";
import { assessEligibility, LEP_HEADQUARTERS } from "@lep/funding";
import { assembleAnalysis } from "./analysis";

// Edital FICTÍCIO — nenhum dado real.
const TEXT = `FUNDAÇÃO FICTÍCIA DE AUDIOVISUAL
EDITAL Nº 3/2026 — PRODUÇÃO DE LONGAS DOCUMENTAIS
1. DO OBJETO
1.1 O presente edital tem por objeto selecionar projetos de produção de longa-metragem documentário.
2. DA PARTICIPAÇÃO
2.1 Podem participar produtoras de todo o território nacional.
3. DOS RECURSOS
Valor total disponibilizado: R$ 3.000.000,00, até R$ 600.000,00 por projeto.
4. DAS INSCRIÇÕES
As inscrições encerram-se em 10/10/2026.
5. DA DOCUMENTAÇÃO
a) contrato social;
b) orçamento detalhado;`;

const now = new Date("2026-10-01T12:00:00-03:00");

function analyze(overrides: Partial<Parameters<typeof assembleAnalysis>[0]> = {}) {
  return assembleAnalysis({
    fileName: "edital-ficticio.pdf",
    suggestedTitle: "edital-ficticio",
    text: TEXT,
    pdf: { pages: 3, scanned: false, truncated: false },
    eligibility: assessEligibility(TEXT, { proponent: LEP_HEADQUARTERS }),
    projects: [
      {
        id: "p1",
        title: "Documentário Fictício",
        format: "feature_film",
        genre: "documentary",
        stage: "production",
        budget: 500000,
      },
    ],
    proponent: LEP_HEADQUARTERS,
    duplicate: null,
    now,
    ...overrides,
  });
}

describe("Analisar Edital — análise sem cadastro", () => {
  it("informações principais com a origem (trecho)", () => {
    const view = analyze();
    expect(view.title).toBe("EDITAL Nº 3/2026 — PRODUÇÃO DE LONGAS DOCUMENTAIS");
    expect(view.institution?.value).toBe("FUNDAÇÃO FICTÍCIA DE AUDIOVISUAL");
    expect(view.summary?.text).toContain("tem por objeto selecionar projetos");
    expect(view.deadline?.value).toBe("10/10/2026");
    expect(view.deadline?.evidence?.snippet).toContain("10/10/2026");
    expect(view.totalAmount?.value).toContain("3.000.000");
    expect(view.maxAmountPerProject?.value).toContain("600.000");
    expect(view.participation[0]?.text).toContain("Podem participar produtoras");
    expect(view.documents.map((item) => item.text)).toEqual([
      "a) contrato social;",
      "b) orçamento detalhado;",
    ]);
  });

  it("territorialidade, prazo próximo e aderência pelo motor atual", () => {
    const view = analyze();
    expect(view.territoriality.status).toBe("eligible");
    expect(view.attention.some((note) => note.startsWith("Prazo próximo"))).toBe(true);
    expect(view.adherence?.totalProjects).toBe(1);
    expect(view.compatible.map((item) => item.title)).toEqual(["Documentário Fictício"]);
  });

  it("pontos de atenção: sem prazo, sem produções, duplicado", () => {
    const view = analyze({
      text: "Documento sem datas.",
      projects: [],
      duplicate: { editalId: "e1", title: "Edital já cadastrado" },
    });
    expect(view.deadline).toBeNull();
    expect(view.attention).toEqual(
      expect.arrayContaining([
        "Prazo de inscrição não identificado no documento.",
        "Nenhuma produção cadastrada: a aderência não pôde ser calculada.",
        "Este documento já está nos Editais: “Edital já cadastrado”.",
      ]),
    );
    expect(view.title).toBe("edital-ficticio");
  });

  it("PDF digitalizado vira aviso, nunca conteúdo inventado", () => {
    const view = analyze({ text: "", pdf: { pages: 2, scanned: true, truncated: false } });
    expect(view.attention.some((note) => note.includes("digitalizado"))).toBe(true);
    expect(view.summary).toBeNull();
    expect(view.participation).toEqual([]);
  });
});
