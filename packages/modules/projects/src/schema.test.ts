import { describe, expect, it } from "vitest";
import { projectInputSchema } from "./schema";

const valid = {
  title: "  Projeto Exemplo  ",
  format: "feature_film",
  genre: "documentary",
  stage: "development",
  budget: "1500000.50",
  synopsis: "",
};

describe("projectInputSchema", () => {
  it("normaliza um cadastro válido", () => {
    const result = projectInputSchema.parse(valid);
    expect(result).toEqual({
      title: "Projeto Exemplo",
      format: "feature_film",
      genre: "documentary",
      stage: "development",
      budget: 1500000.5,
      synopsis: null,
    });
  });

  it("aceita orçamento em branco como não informado", () => {
    expect(projectInputSchema.parse({ ...valid, budget: "" }).budget).toBeNull();
  });

  it("rejeita valores fora do vocabulário e orçamento negativo", () => {
    expect(projectInputSchema.safeParse({ ...valid, format: "novela" }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, budget: "-10" }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...valid, title: "a" }).success).toBe(false);
  });
});
