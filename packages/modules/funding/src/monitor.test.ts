import { describe, expect, it } from "vitest";
import { findDeadline, findTotalAmount, selectCandidates, statusFromDeadline } from "./monitor";

const links = [
  {
    text: "Edital nº 7 – Investimento em produções com grande potencial comercial",
    url: "https://riofilme.com.br/editais/edital-7/",
  },
  { text: "Saiba mais", url: "https://riofilme.com.br/editais/edital-9/" },
  { text: "Resultado final do Edital nº 5", url: "https://riofilme.com.br/editais/resultado-5/" },
  { text: "Política de privacidade da empresa", url: "https://riofilme.com.br/privacidade/" },
  {
    text: "Chamada pública para desenvolvimento de séries",
    url: "https://riofilme.com.br/editais/chamada-series/",
  },
  { text: "Edital de fomento a projetos de música", url: "https://outro.gov.br/edital-musica/" },
  { text: "Regulamento do Edital 8 (PDF)", url: "https://arquivos.rj.gov.br/edital-8.pdf" },
  { text: "Todos os editais anteriores", url: "https://riofilme.com.br/editais/arquivo/" },
];

describe("selectCandidates", () => {
  it("fonte de audiovisual: pega editais da própria fonte e PDFs, ignora ruído", () => {
    const result = selectCandidates(
      links,
      { listUrl: "https://riofilme.com.br/editais/", audiovisualOnly: true, linkContains: null },
      new Set(),
    );
    expect(result.map((c) => c.url)).toEqual([
      "https://riofilme.com.br/editais/edital-7/",
      "https://riofilme.com.br/editais/chamada-series/",
      "https://arquivos.rj.gov.br/edital-8.pdf",
    ]);
  });

  it("fonte geral: exige termo de audiovisual no título ou endereço", () => {
    const result = selectCandidates(
      [
        {
          text: "Edital de fomento a projetos de música",
          url: "https://cultura.sp.gov.br/editais/musica/",
        },
        {
          text: "Edital de produção de longa-metragem",
          url: "https://cultura.sp.gov.br/editais/longa/",
        },
      ],
      { listUrl: "https://cultura.sp.gov.br/editais/", audiovisualOnly: false, linkContains: null },
      new Set(),
    );
    expect(result.map((c) => c.title)).toEqual(["Edital de produção de longa-metragem"]);
  });

  it("ignora links já conhecidos e aplica o filtro de endereço", () => {
    const result = selectCandidates(
      links,
      {
        listUrl: "https://riofilme.com.br/editais/",
        audiovisualOnly: true,
        linkContains: "/editais/",
      },
      new Set(["https://riofilme.com.br/editais/edital-7/"]),
    );
    expect(result.map((c) => c.url)).toEqual(["https://riofilme.com.br/editais/chamada-series/"]);
  });
});

describe("findDeadline", () => {
  it("usa a maior data perto de termos de inscrição", () => {
    expect(
      findDeadline("Publicado em 10/09/2026. Inscrições de 01/10/2026 a 30/11/2026, pelo site."),
    ).toBe("2026-11-30");
  });

  it("entende datas por extenso", () => {
    expect(findDeadline("O prazo para envio encerra em 5 de dezembro de 2026, às 18h.")).toBe(
      "2026-12-05",
    );
  });

  it("não inventa prazo sem contexto", () => {
    expect(findDeadline("Publicado em 10/09/2026 pela equipe.")).toBeNull();
    expect(findDeadline("Inscrições em breve.")).toBeNull();
  });
});

describe("findTotalAmount", () => {
  it("lê valores em reais e por extenso", () => {
    expect(findTotalAmount("O edital tem valor total de R$ 10.000.000,00 para 5 projetos.")).toBe(
      10000000,
    );
    expect(findTotalAmount("Investimento de R$ 2,5 milhões em obras audiovisuais.")).toBe(2500000);
    expect(
      findTotalAmount("Serão disponibilizados R$ 800 mil, até R$ 200.000,00 por projeto."),
    ).toBe(800000);
  });

  it("ignora valores sem contexto de recurso", () => {
    expect(findTotalAmount("Taxa de R$ 50,00 para cópia.")).toBeNull();
  });
});

describe("statusFromDeadline", () => {
  it("define aberto/encerrado pelo prazo", () => {
    expect(statusFromDeadline("2026-11-30", "2026-09-26")).toBe("open");
    expect(statusFromDeadline("2026-09-01", "2026-09-26")).toBe("closed");
    expect(statusFromDeadline(null, "2026-09-26")).toBeNull();
  });
});
