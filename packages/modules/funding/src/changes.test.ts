import { describe, expect, it } from "vitest";
import { changeColumns, changeSummary, diffFields, isRectification } from "./changes";
import { toEdital } from "./edital";
import { extractFields } from "./extract";

const edital = toEdital({
  id: "e1",
  title: "Edital fictício",
  deadline: "2026-11-30T23:59:00-03:00",
  total_amount: 1_000_000,
  accepted_formats: ["feature_film"],
});

describe("diffFields", () => {
  it("prazo prorrogado e valor alterado → alterações com antes, depois e trecho", () => {
    const changes = diffFields(
      edital,
      extractFields([
        {
          kind: "pdf",
          text: "Retificação: as inscrições encerram-se em 15/12/2026. Valor total de R$ 1.200.000,00.",
        },
      ]),
    );
    expect(changes.map((change) => [change.field, change.before, change.after])).toEqual([
      ["deadline", "2026-11-30", "2026-12-15"],
      ["totalAmount", 1_000_000, 1_200_000],
    ]);
    expect(changes[0]).toMatchObject({ label: "Prazo final de inscrição", source: "pdf" });
    expect(changes[0]!.snippet).toContain("15/12/2026");
  });

  it("mesmos valores (ou listas na outra ordem) → nenhuma alteração", () => {
    const same = toEdital({ ...edital, id: "e2", accepted_formats: ["series", "feature_film"] });
    expect(
      diffFields(
        same,
        extractFields([
          { kind: "page", text: "Inscrições até 30/11/2026. Séries de ficção e longas-metragens." },
        ]),
      ).filter((change) => change.field === "deadline" || change.field === "formats"),
    ).toEqual([]);
  });

  it("campo que sumiu do texto não é alteração (evita falso alarme)", () => {
    expect(
      diffFields(edital, extractFields([{ kind: "page", text: "Página em manutenção." }])),
    ).toEqual([]);
  });
});

describe("isRectification / changeSummary / changeColumns", () => {
  it.each([
    ["Retificação nº 1 do Edital 5/2026", "", true],
    ["Errata", "", true],
    ["Anexo", "https://a.exemplo.org/arquivos/termo-aditivo-edital.pdf", true],
    ["Prorrogação das inscrições", "", true],
    ["Edital completo", "https://a.exemplo.org/edital.pdf", false],
  ])("%s %s → %s", (label, url, expected) => {
    expect(isRectification(label, url)).toBe(expected);
  });

  it("resumo e colunas para aplicar", () => {
    const changes = diffFields(
      edital,
      extractFields([{ kind: "page", text: "Inscrições até 15/12/2026." }]),
    );
    expect(changeSummary(changes, 1)).toBe(
      "1 retificação(ões)/errata(s) nova(s); alteração em: Prazo final de inscrição.",
    );
    expect(changeSummary([], 0)).toBe("Sem alterações nos campos extraídos.");
    expect(changeColumns(changes)).toEqual({ deadline: "2026-12-15T23:59:00-03:00" });
  });
});
