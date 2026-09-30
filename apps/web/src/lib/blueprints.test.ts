import { describe, expect, it } from "vitest";
import {
  AUDIOVISUAL_FUNCTIONS,
  CURRENT_PRODUCTION_STATES,
  PRODUCTION_AREAS,
  PRODUCTION_LIFECYCLE,
  TEAM_PROFILE_SECTIONS,
} from "./blueprints";

describe("plantas dos módulos futuros", () => {
  it("produção tem as 10 áreas previstas, com Orçamento dentro da produção", () => {
    expect(PRODUCTION_AREAS.map((area) => area.label)).toEqual([
      "Visão Geral",
      "Orçamento",
      "Equipe",
      "Cronograma",
      "Fornecedores",
      "Documentos e Arquivos",
      "Contratos",
      "Direitos e Autorizações",
      "Financeiro / Prestação de Contas",
      "Histórico",
    ]);
  });

  it("ciclo de vida na ordem; Produções Atuais usa estados do mesmo ciclo", () => {
    expect(PRODUCTION_LIFECYCLE.map((step) => step.label)).toEqual([
      "Em orçamento",
      "Aprovada",
      "Em produção",
      "Finalizada",
      "Arquivada",
    ]);
    const keys = PRODUCTION_LIFECYCLE.map((step) => step.key);
    for (const state of CURRENT_PRODUCTION_STATES) expect(keys).toContain(state);
  });

  it("equipe audiovisual: funções únicas, inclui Assistente de Platô", () => {
    expect(new Set(AUDIOVISUAL_FUNCTIONS).size).toBe(AUDIOVISUAL_FUNCTIONS.length);
    expect(AUDIOVISUAL_FUNCTIONS).toContain("Assistente de Platô");
    expect(TEAM_PROFILE_SECTIONS.map((section) => section.title)).toEqual([
      "Identificação",
      "Profissional",
      "Relacionamento LEP",
    ]);
  });
});
