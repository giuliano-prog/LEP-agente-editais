import { describe, expect, it } from "vitest";
import { chunkEditalText, NoopEditalQuestionAnswerer } from "./edital-questions";

describe("Pergunte sobre este edital (contrato)", () => {
  it("sem IA configurada: não responde e não envia nada", async () => {
    const answerer = new NoopEditalQuestionAnswerer();
    expect(answerer.enabled).toBe(false);
    const answer = await answerer.ask();
    expect(answer).toMatchObject({ answer: null, citations: [] });
  });

  it("divide o texto em trechos sem perder conteúdo nem passar do limite", () => {
    const text = `1. DO OBJETO\nSeleção de projetos (fictício).\n\n2. DOS PRAZOS\n${"prazo ".repeat(300)}`;
    const chunks = chunkEditalText(text, 200);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.text.length <= 200)).toBe(true);
    expect(chunks.map((chunk) => chunk.id)).toEqual(chunks.map((_, index) => `t${index + 1}`));
    const words = (value: string) => value.replace(/\s+/g, " ").trim();
    expect(words(chunks.map((chunk) => chunk.text).join(" "))).toBe(words(text));
  });
});
