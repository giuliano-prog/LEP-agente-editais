import { describe, expect, it } from "vitest";
import { assessEligibility, ELIGIBILITY_LABELS, ELIGIBILITY_STATUSES } from "./eligibility";

describe("assessEligibility (terceiro eixo: elegibilidade da LEP)", () => {
  it("nacional → elegível, com evidência", () => {
    const result = assessEligibility("Podem participar produtoras de todo o território nacional.");
    expect(result).toMatchObject({ status: "eligible", territories: ["BR"] });
    expect(result.evidence).toContain("territorio nacional");
  });

  it("exclusivo de outro município → restrição territorial visível (não 'não elegível')", () => {
    const result = assessEligibility(
      "Somente empresas produtoras sediadas no Município do Rio de Janeiro há pelo menos 2 anos.",
    );
    expect(result.status).toBe("territorial_restriction");
    expect(result.reason).toContain("a LEP Filmes é sediada em São Paulo/SP");
    expect(result.evidence).toContain("sediadas no municipio do rio de janeiro");
  });

  it("sem informação → não confirmada (incerteza nunca vira não elegível)", () => {
    const result = assessEligibility(
      "Prêmio para roteiros de longa-metragem. Inscrições até 10/11/2026.",
    );
    expect(result).toMatchObject({ status: "not_confirmed", evidence: null });
  });

  it("nacional com cotas regionais → necessita revisão", () => {
    const result = assessEligibility(
      "Edital de abrangência nacional. 30% das vagas reservadas a produtoras sediadas no estado da Bahia.",
    );
    expect(result.status).toBe("needs_review");
  });

  it("SP é aceito", () => {
    expect(
      assessEligibility("Exclusivo para empresas sediadas no Estado de São Paulo.").status,
    ).toBe("eligible");
  });

  it("parceria configurada no território exigido → via parceiro (LEP não vira proponente)", () => {
    const text = "Somente produtoras sediadas no Município do Rio de Janeiro.";
    expect(assessEligibility(text, { partnerTerritories: ["RJ"] })).toMatchObject({
      status: "via_partner",
    });
    expect(assessEligibility(text, { partnerTerritories: ["RJ"] }).reason).toContain(
      "não conta para a elegibilidade da LEP",
    );
    // Sem parceria configurada (padrão atual): restrição territorial. Nenhuma exceção fixa no código.
    expect(assessEligibility(text).status).toBe("territorial_restriction");
    expect(assessEligibility(text, { partnerTerritories: ["MG"] }).status).toBe(
      "territorial_restriction",
    );
  });

  it("somente pessoa física → pessoa física", () => {
    const result = assessEligibility(
      "Podem participar exclusivamente pessoas físicas maiores de 18 anos, residentes no Brasil.",
    );
    expect(result.status).toBe("individual");
    expect(result.evidence).toContain("pessoas fisicas");
  });

  it("pessoa física OU jurídica → segue para as regras de território", () => {
    expect(
      assessEligibility(
        "Podem participar pessoas físicas ou pessoas jurídicas de todo o território nacional.",
      ).status,
    ).toBe("eligible");
  });

  it("nunca conclui 'não elegível' sozinho (só decisão humana)", () => {
    const texts = [
      "",
      "Somente produtoras sediadas no Município do Rio de Janeiro.",
      "Exclusivamente pessoas físicas.",
      "Edital nacional com cotas para a região Norte.",
    ];
    for (const text of texts) expect(assessEligibility(text).status).not.toBe("not_eligible");
  });

  it("rótulos em pt-BR para todos os status", () => {
    expect(ELIGIBILITY_STATUSES.every((status) => ELIGIBILITY_LABELS[status])).toBe(true);
  });
});
