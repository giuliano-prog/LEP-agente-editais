import { describe, expect, it } from "vitest";
import { extractHighlights } from "./highlights";

// Texto FICTÍCIO (nenhum edital real).
const TEXT = `SECRETARIA FICTÍCIA DE CULTURA
EDITAL Nº 12/2026 — PRODUÇÃO DE DOCUMENTÁRIOS (FICTÍCIO)
1. DO OBJETO
1.1 O presente edital tem por objeto selecionar projetos de produção de documentários de longa-metragem.
2. DA PARTICIPAÇÃO
2.1 Podem participar produtoras independentes com sede em qualquer estado do Brasil.
2.2 Não poderão participar pessoas físicas.
3. DOS REQUISITOS
3.1 A proponente deverá comprovar registro regular na ANCINE. Cada produtora poderá inscrever um único projeto.
4. DA DOCUMENTAÇÃO
a) contrato social atualizado;
b) certidão negativa de débitos;
c) orçamento detalhado do projeto;
5. DO PRAZO
As inscrições encerram-se em 30/11/2026.`;

describe("destaques do edital (trechos literais)", () => {
  const result = extractHighlights(TEXT, { kind: "pdf", label: "Documento (PDF)" });

  it("título, instituição e objeto com evidência", () => {
    expect(result.title?.text).toBe("EDITAL Nº 12/2026 — PRODUÇÃO DE DOCUMENTÁRIOS (FICTÍCIO)");
    expect(result.institution?.text).toBe("SECRETARIA FICTÍCIA DE CULTURA");
    expect(result.object?.text).toContain("tem por objeto selecionar projetos");
    expect(result.object?.evidence).toMatchObject({ source: "pdf", label: "Documento (PDF)" });
  });

  it("quem pode participar (inclui vedações)", () => {
    const texts = result.participation.map((item) => item.text);
    expect(texts.some((text) => text.includes("Podem participar produtoras independentes"))).toBe(
      true,
    );
    expect(texts.some((text) => text.includes("Não poderão participar pessoas físicas"))).toBe(
      true,
    );
  });

  it("requisitos e documentação da seção própria", () => {
    expect(result.requirements[0]?.text).toContain("deverá comprovar registro regular na ANCINE");
    expect(result.documents.map((item) => item.text)).toEqual([
      "a) contrato social atualizado;",
      "b) certidão negativa de débitos;",
      "c) orçamento detalhado do projeto;",
    ]);
  });

  it("todo destaque é trecho do próprio texto (nada inventado)", () => {
    const flat = TEXT.replace(/\s+/g, " ");
    const all = [
      result.title,
      result.institution,
      result.object,
      ...result.participation,
      ...result.requirements,
      ...result.documents,
    ].filter((item) => item !== null);
    for (const item of all) expect(flat).toContain(item.text.replace(/…$/, ""));
  });

  it("sem os temas: listas vazias, nunca texto inventado", () => {
    const empty = extractHighlights("Texto qualquer sem estrutura de edital.");
    expect(empty).toEqual({
      title: null,
      institution: null,
      object: null,
      participation: [],
      requirements: [],
      documents: [],
    });
  });

  it("trechos longos são cortados com reticências", () => {
    const long = `O presente edital tem por objeto ${"apoiar a produção audiovisual ".repeat(20)}.`;
    const text = extractHighlights(long).object?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(320);
    expect(text.endsWith("…")).toBe(true);
  });
});
