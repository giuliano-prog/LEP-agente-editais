import { describe, expect, it } from "vitest";
import {
  assessTerritory,
  isProponentEligible,
  LEP_HEADQUARTERS,
  territoryLabel,
} from "./territory";

describe("assessTerritory — diretriz territorial da LEP (sede em São Paulo/SP)", () => {
  it.each([
    "Poderão participar empresas produtoras independentes sediadas no Município do Rio de Janeiro há pelo menos 2 anos.",
    "Somente proponentes com sede e foro no Estado de Minas Gerais.",
    "Exclusivamente para produtoras cariocas com registro na ANCINE.",
    "Pessoas jurídicas domiciliadas no Distrito Federal.",
    "Empresas estabelecidas no município de Campinas.",
    // Diretriz 2: parceria com empresa local não torna a LEP elegível.
    "Proponentes sediados no Estado da Bahia, admitida coprodução com empresas de outros estados.",
  ])("rejeita exclusividade de outro território: %s", (text) => {
    const result = assessTerritory(text);
    expect(result.verdict).toBe("ineligible");
    expect(result.reason).toContain("a LEP Filmes é sediada em São Paulo/SP");
    expect(result.evidence).not.toBeNull();
  });

  it.each([
    ["Empresas sediadas no Estado de São Paulo, com CNPJ ativo.", "SP"],
    ["Produtoras com sede no Município de São Paulo há pelo menos 1 ano.", "SP:São Paulo"],
    ["Exclusivamente para produtoras paulistanas.", "SP:São Paulo"],
    ["Proponentes paulistas ou com sede em SP.", "SP"],
  ])("aceita editais de SP: %s", (text, territory) => {
    const result = assessTerritory(text);
    expect(result.verdict).toBe("eligible");
    expect(result.territories).toContain(territory);
  });

  it.each([
    "Podem participar empresas produtoras brasileiras de todo o território nacional.",
    "Chamada pública de âmbito nacional para produtoras independentes.",
    "Pessoas jurídicas com sede no Brasil e registro na ANCINE.",
  ])("aceita editais nacionais/federais: %s", (text) => {
    expect(assessTerritory(text)).toMatchObject({ verdict: "eligible", territories: ["BR"] });
  });

  it("edital nacional com cota regional continua elegível, com aviso", () => {
    const result = assessTerritory(
      "Edital de abrangência nacional. 30% dos recursos reservados a proponentes sediados no Estado do Pará.",
    );
    expect(result.verdict).toBe("eligible");
    expect(result.territories).toEqual(["BR", "PA"]);
    expect(result.reason).toContain("verificar");
  });

  it("sem informação territorial: desconhecido (verificação humana), nunca rejeita", () => {
    expect(
      assessTerritory("Edital de apoio à produção de longas-metragens. Inscrições até 30/11/2026."),
    ).toMatchObject({
      verdict: "unknown",
      territories: [],
    });
  });

  it("menções a lugares sem exigência de sede não restringem", () => {
    expect(
      assessTerritory(
        "As filmagens poderão ocorrer no Estado do Rio de Janeiro ou em qualquer estado.",
      ).verdict,
    ).not.toBe("ineligible");
  });
});

describe("isProponentEligible / territoryLabel", () => {
  it("compara a sede da LEP com os territórios aceitos", () => {
    expect(isProponentEligible(["BR"], LEP_HEADQUARTERS)).toBe(true);
    expect(isProponentEligible(["SP"], LEP_HEADQUARTERS)).toBe(true);
    expect(isProponentEligible(["SP:Sao Paulo"], LEP_HEADQUARTERS)).toBe(true);
    expect(isProponentEligible(["SP:Campinas"], LEP_HEADQUARTERS)).toBe(false);
    expect(isProponentEligible(["RJ", "MG"], LEP_HEADQUARTERS)).toBe(false);
    expect(isProponentEligible([], LEP_HEADQUARTERS)).toBe(false);
  });

  it("gera rótulos legíveis", () => {
    expect(territoryLabel("BR")).toBe("Todo o Brasil");
    expect(territoryLabel("RJ")).toBe("Estado de Rio de Janeiro");
    expect(territoryLabel("SP:São Paulo")).toBe("Município de São Paulo/SP");
  });
});
