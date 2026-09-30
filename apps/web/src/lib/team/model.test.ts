import { describe, expect, it } from "vitest";
import { DEMO_PROFESSIONALS } from "@/lib/demo/professionals";
import { categoriesOf, filterProfessionals, TEAM_CATEGORIES, type Professional } from "./model";

const base = DEMO_PROFESSIONALS[0]!;
const multi: Professional = {
  ...base,
  slug: "pessoa-ficticia",
  name: "Pessoa Fictícia",
  mainRole: "Som Direto",
  otherRoles: ["Câmera"],
};

describe("Equipe Audiovisual", () => {
  it("categorias pedidas estão presentes (lista aberta)", () => {
    const labels = TEAM_CATEGORIES.map((category) => category.label);
    for (const label of [
      "Direção",
      "Roteiro",
      "Produção Executiva",
      "Produção",
      "Assistência de Produção",
      "Platô",
      "Direção de Fotografia",
      "Câmera",
      "Som",
      "Arte",
      "Maquiagem / Figurino",
      "Atrizes e Atores",
    ]) {
      expect(labels).toContain(label);
    }
  });

  it("um profissional pode ter várias funções/categorias", () => {
    expect(categoriesOf(multi).map((category) => category.key)).toEqual(["camera", "som"]);
  });

  it("busca por nome ou função, sem acentos; filtro por categoria", () => {
    const list = [base, multi];
    expect(filterProfessionals(list, { query: "giuliano" }).map((p) => p.slug)).toEqual([
      "giuliano-carvalho",
    ]);
    expect(filterProfessionals(list, { query: "assistente de plato" })).toHaveLength(1);
    expect(filterProfessionals(list, { query: "camera" }).map((p) => p.slug)).toEqual([
      "pessoa-ficticia",
    ]);
    expect(filterProfessionals(list, { category: "plato" }).map((p) => p.slug)).toEqual([
      "giuliano-carvalho",
    ]);
    expect(filterProfessionals(list, {})).toHaveLength(2);
  });

  it("exemplo não inventa dados pessoais", () => {
    expect(base).toMatchObject({ name: "Giuliano Carvalho", mainRole: "Assistente de Platô" });
    for (const key of [
      "location",
      "contact",
      "experience",
      "portfolioUrl",
      "cvUrl",
      "availability",
      "referenceFee",
      "internalNotes",
      "photoUrl",
    ] as const) {
      expect(base[key]).toBeNull();
    }
    expect(base.otherRoles).toEqual([]);
    expect(base.lepProductions).toEqual([]);
  });
});
