import { describe, expect, it } from "vitest";
import { classifyPage, IMPORTABLE_PAGE_TYPES, opportunityKind } from "./page-classifier";

const long = (text: string) =>
  `${text} ${"Texto institucional complementar da página. ".repeat(6)}`;

describe("classifyPage", () => {
  it("edital com inscrição, regulamento e valor → oportunidade, com os sinais explicados", () => {
    const result = classifyPage({
      title: "Edital de Produção de Longas-Metragens 2026",
      url: "https://fomento.exemplo.org/editais/producao-longas/",
      text: long(
        "Inscrições abertas até 30/11/2026. Leia o regulamento. Podem participar produtoras independentes. Valor total de R$ 10.000.000,00.",
      ),
    });
    expect(result.type).toBe("opportunity");
    expect(result.kind).toBe("edital");
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "período de inscrição",
        "regulamento/edital",
        "quem pode participar",
        "valor em R$",
      ]),
    );
  });

  it("página institucional (Programa de Integridade) → ignorada com motivo", () => {
    const result = classifyPage({
      title: "Programa de Integridade",
      url: "https://fomento.exemplo.org/editais/programa-de-integridade/",
      text: long("Código de conduta e canal de denúncias."),
    });
    expect(result.type).toBe("institutional");
    expect(IMPORTABLE_PAGE_TYPES.has(result.type)).toBe(false);
    expect(result.reasons[0]).toContain("integridade");
  });

  it("índice de chamamentos (muitos links de editais, sem período de inscrição) → lista", () => {
    const result = classifyPage({
      title: "Chamamento Público",
      url: "https://cultura.exemplo.org/chamamento-publico/",
      text: long("Confira os chamamentos publicados pela secretaria."),
      editalLinkCount: 12,
    });
    expect(result.type).toBe("listing");
  });

  it("resultado e retificação pelo título ou endereço", () => {
    expect(
      classifyPage({
        title: "Resultado final do Edital nº 5",
        url: "https://a.exemplo.org/x/",
        text: "",
      }).type,
    ).toBe("result");
    expect(
      classifyPage({
        title: "Edital 5",
        url: "https://a.exemplo.org/editais/homologacao-edital-5/",
        text: "",
      }).type,
    ).toBe("result");
    expect(
      classifyPage({
        title: "Retificação do Edital 3/2026",
        url: "https://a.exemplo.org/x/",
        text: "",
      }).type,
    ).toBe("rectification");
  });

  it("notícia sem detalhes do edital → notícia; notícia com todos os detalhes → segue avaliada", () => {
    expect(
      classifyPage({
        title: "Secretaria lança edital de cinema",
        url: "https://a.exemplo.org/noticias/lanca-edital/",
        text: long("A secretaria anunciou hoje um novo edital para o audiovisual."),
      }).type,
    ).toBe("news");
    expect(
      classifyPage({
        title: "Secretaria lança edital de cinema",
        url: "https://a.exemplo.org/noticias/lanca-edital/",
        text: long(
          "Inscrições abertas até 10/10/2026. Regulamento disponível. Proponentes: produtoras. R$ 500.000,00.",
        ),
      }).type,
    ).toBe("opportunity");
  });

  it("na dúvida → incerta (entra para revisão; nunca descartada em silêncio)", () => {
    expect(
      classifyPage({
        title: "Edital Exemplo",
        url: "https://a.exemplo.org/e/",
        text: "Carregando...",
      }).type,
    ).toBe("uncertain");
    const vague = classifyPage({
      title: "Linha de fomento ao audiovisual",
      url: "https://a.exemplo.org/linha/",
      text: long("Informações gerais sobre a linha."),
    });
    expect(vague.type).toBe("uncertain");
    expect(IMPORTABLE_PAGE_TYPES.has(vague.type)).toBe(true);
  });

  it("processo seletivo de estágio/servidor não é oportunidade da LEP", () => {
    expect(
      classifyPage({
        title: "Processo seletivo simplificado para estagiários",
        url: "https://a.exemplo.org/editais/estagio/",
        text: long("Inscrições abertas até 10/10/2026."),
      }).type,
    ).toBe("institutional");
  });
});

describe("opportunityKind", () => {
  it.each([
    ["Chamada Pública 01/2026", "call"],
    ["Prêmio de Roteiro", "award"],
    ["Credenciamento de pareceristas", "accreditation"],
    ["Laboratório de Desenvolvimento de Séries", "lab"],
    ["Edital de Produção", "edital"],
    ["Mostra de Cinema", "festival"],
    ["Algo diferente", "other"],
  ])("%s → %s", (title, kind) => {
    expect(opportunityKind(title)).toBe(kind);
  });
});
