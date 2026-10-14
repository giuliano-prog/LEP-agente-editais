import { describe, expect, it } from "vitest";
import { getWorkspaceReviewer, validateWorkspaceReview } from "./workspace-reviewer";

describe("WorkspaceReviewer (ponto de integração futura)", () => {
  it("padrão é desligado e não envia nada", async () => {
    const reviewer = getWorkspaceReviewer();
    expect(reviewer.enabled).toBe(false);
    await expect(
      reviewer.review({ editalTitle: "x", editalText: "y", criteria: [], texts: [] }),
    ).resolves.toEqual({ suggestions: [], warnings: [] });
  });

  it("descarta sugestão sem trecho literal e afirmações de aprovação", () => {
    const result = validateWorkspaceReview(
      {
        warnings: [],
        suggestions: [
          {
            kind: "missing_item",
            title: "Carta de anuência",
            detail: "",
            quote: "carta de anuência do autor",
          },
          {
            kind: "missing_item",
            title: "Inventado",
            detail: "",
            quote: "documento que não existe no edital",
          },
          { kind: "text_feedback", title: "Sinopse", detail: "Com isso o projeto será aprovado" },
          { kind: "text_feedback", title: "Sinopse", detail: "Detalhe o público-alvo" },
        ],
      },
      { editalText: "Anexar a Carta de Anuência do autor e o roteiro." },
    );
    expect(result.suggestions.map((s) => s.title)).toEqual(["Carta de anuência", "Sinopse"]);
    expect(result.warnings).toHaveLength(2);
  });
});
