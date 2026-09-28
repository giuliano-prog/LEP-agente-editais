import { describe, expect, it } from "vitest";
import { evidenceRecord, extractFields, extractionNotes, suggestionColumns } from "./extract";

const page = (text: string) => ({ kind: "page" as const, text });
const pdf = (text: string) => ({ kind: "pdf" as const, text, label: "Regulamento (PDF)" });

describe("extractFields (evidência por campo)", () => {
  it("prazo, abertura, valores, quantidade e vocabulário — cada um com o trecho", () => {
    const fields = extractFields([
      page(
        "Edital fictício de produção de longas-metragens de ficção e documentário. " +
          "As inscrições vão de 01/10/2026 a 30/11/2026. " +
          "O valor total disponibilizado é de R$ 10.000.000,00, com até R$ 2.000.000,00 por projeto. " +
          "Serão selecionados até 5 projetos. Apoio também à finalização de obras.",
      ),
    ]);
    expect(fields.deadline?.value).toBe("2026-11-30");
    expect(fields.opensAt?.value).toBe("2026-10-01");
    expect(fields.totalAmount?.value).toBe(10_000_000);
    expect(fields.maxAmountPerProject?.value).toBe(2_000_000);
    expect(fields.projectCount?.value).toBe(5);
    expect(fields.formats?.value).toEqual(["feature_film"]);
    expect(fields.genres?.value).toEqual(["fiction", "documentary"]);
    expect(fields.stages?.value).toEqual(expect.arrayContaining(["production", "post_production"]));
    expect(fields.deadline?.evidence).toMatchObject({ source: "page" });
    expect(fields.deadline?.evidence.snippet).toContain("30/11/2026");
    expect(fields.totalAmount?.evidence.snippet).toContain("R$ 10.000.000,00");
    expect(fields.conflicts).toEqual([]);
  });

  it("valor por projeto não é confundido com o total", () => {
    const fields = extractFields([
      page("Recursos: R$ 200 mil por projeto. Valor total de R$ 1,5 milhão."),
    ]);
    expect(fields.totalAmount?.value).toBe(1_500_000);
    expect(fields.maxAmountPerProject?.value).toBe(200_000);
  });

  it("datas por extenso e com ordinal", () => {
    expect(
      extractFields([page("As inscrições encerram-se em 1º de dezembro de 2026, às 18h.")]).deadline
        ?.value,
    ).toBe("2026-12-01");
  });

  it("PDF (regulamento) prevalece e a divergência com a página é registrada", () => {
    const fields = extractFields([
      page("Inscrições até 10/11/2026."),
      pdf("Art. 5º As inscrições encerram-se em 20/11/2026. Valor total de R$ 3.000.000,00."),
    ]);
    expect(fields.deadline).toMatchObject({
      value: "2026-11-20",
      evidence: { source: "pdf", label: "Regulamento (PDF)" },
    });
    expect(fields.totalAmount?.evidence.source).toBe("pdf");
    expect(fields.conflicts).toEqual(["deadline"]);
  });

  it("sem informação → campos vazios (nunca inventa)", () => {
    const fields = extractFields([page("Página do programa. Mais informações em breve.")]);
    expect(
      Object.values(fields).filter((value) => value !== null && !Array.isArray(value)),
    ).toEqual([]);
  });

  it("'produção' solta (produtora, produção audiovisual) não vira estágio", () => {
    expect(
      extractFields([page("Para produtoras de produção audiovisual independente.")]).stages,
    ).toBeNull();
  });

  it("evidenceRecord: formato gravado no banco", () => {
    const record = evidenceRecord(extractFields([page("Inscrições até 10/11/2026.")]));
    expect(record).toEqual({
      deadline: { value: "2026-11-10", snippet: "Inscrições até 10/11/2026.", source: "page" },
    });
  });
});

describe("suggestionColumns / extractionNotes", () => {
  const today = "2026-09-28";

  it("inscrições ainda não abertas → em breve; campos não encontrados ficam de fora", () => {
    const columns = suggestionColumns(
      extractFields([page("Inscrições de 15/10/2026 a 30/11/2026.")]),
      { today },
    );
    expect(columns).toMatchObject({ deadline: "2026-11-30T23:59:00-03:00", status: "upcoming" });
    expect(columns).not.toHaveProperty("total_amount");
    expect(columns).not.toHaveProperty("accepted_formats");
  });

  it("prazo vencido → encerrado; aberto → aberto", () => {
    expect(
      suggestionColumns(extractFields([page("Inscrições até 01/09/2026.")]), { today }).status,
    ).toBe("closed");
    expect(
      suggestionColumns(extractFields([page("Inscrições até 01/12/2026.")]), { today }).status,
    ).toBe("open");
  });

  it("avisos: PDF digitalizado, cortado, com erro e divergência página × regulamento", () => {
    const fields = extractFields([
      page("Inscrições até 10/11/2026."),
      pdf("Inscrições até 20/11/2026."),
    ]);
    expect(
      extractionNotes(fields, {
        pages: 80,
        scanned: true,
        truncated: true,
        error: "O PDF é protegido por senha.",
      }),
    ).toEqual([
      "PDF: O PDF é protegido por senha. Confira o documento manualmente.",
      "O PDF parece digitalizado (imagem). Sem OCR, o texto não foi lido: confira o documento manualmente.",
      "PDF longo: só as primeiras páginas foram lidas.",
      "Página e regulamento divergem em: Prazo final de inscrição (vale o regulamento).",
    ]);
  });
});
