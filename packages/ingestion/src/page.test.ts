import { describe, expect, it } from "vitest";
import { extractDescription, extractLinks, htmlToText, normalizeUrl } from "./page";

describe("normalizeUrl", () => {
  it("remove fragmento e parâmetros de rastreamento", () => {
    expect(normalizeUrl("https://x.br/editais/a?utm_source=news&id=2#topo")).toBe(
      "https://x.br/editais/a?id=2",
    );
  });
});

describe("extractLinks", () => {
  it("agrupa links repetidos mantendo o texto mais descritivo", () => {
    const html = `
      <script>var a = '<a href="/falso">x</a>';</script>
      <a href="/editais/edital-7/"><h3>Edital nº 7 &ndash; Produção</h3></a>
      <a href="/editais/edital-7/#saiba">Saiba mais</a>
      <a href="mailto:x@y.br">Contato</a>
      <a href="/editais/edital-8/?utm_campaign=z"><img title="Edital 8 imagem"></a>`;
    expect(extractLinks(html, "https://riofilme.com.br/editais/")).toEqual([
      { url: "https://riofilme.com.br/editais/edital-7/", text: "Edital nº 7 – Produção" },
      { url: "https://riofilme.com.br/editais/edital-8/", text: "Edital 8 imagem" },
    ]);
  });
});

describe("htmlToText / extractDescription", () => {
  it("gera texto legível sem menus e scripts", () => {
    const html =
      "<nav>Menu</nav><h1>Edital</h1><p>Inscrições até <b>30/11/2026</b>.</p><script>x()</script>";
    expect(htmlToText(html)).toBe("Edital\nInscrições até 30/11/2026 .");
  });

  it("lê a descrição da página", () => {
    expect(
      extractDescription(
        '<meta name="description" content="Edital de apoio à produção de longas-metragens.">',
      ),
    ).toBe("Edital de apoio à produção de longas-metragens.");
    expect(extractDescription('<meta name="description" content="curto">')).toBeNull();
  });
});
