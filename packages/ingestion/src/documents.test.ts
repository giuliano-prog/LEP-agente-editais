import { describe, expect, it } from "vitest";
import {
  decodeHtml,
  detectKind,
  extractHtmlMetadata,
  isPdf,
  sha256,
  titleFromFileName,
} from "./documents";

describe("documentos", () => {
  it("calcula SHA-256", () => {
    expect(sha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("identifica PDF pela assinatura, não pela extensão", () => {
    expect(isPdf(Buffer.from("%PDF-1.7\n..."))).toBe(true);
    expect(isPdf(Buffer.from("<html>"))).toBe(false);
    expect(detectKind("application/octet-stream", Buffer.from("%PDF-1.4"))).toBe("pdf");
    expect(detectKind("text/html", Buffer.from("<html>"))).toBe("html");
    expect(detectKind("application/zip", Buffer.from("PK..."))).toBeNull();
  });

  it("decodifica páginas em ISO-8859-1 (comum em sites públicos)", () => {
    const latin1 = Buffer.from(
      '<meta charset="iso-8859-1"><title>Edital de Produ\xe7\xe3o</title>',
      "latin1",
    );
    expect(decodeHtml("text/html", latin1)).toContain("Edital de Produção");
  });

  it("extrai título e links de PDF da página", () => {
    const html = `
      <html><head><title>Ignorado</title><meta property="og:title" content="Edital n&ordm; 7 &amp; Anexos"></head>
      <body>
        <a href="/arquivos/edital.pdf">Edital <b>completo</b></a>
        <a href="https://outro.gov.br/anexo-i.PDF?v=2">Anexo I</a>
        <a href="/arquivos/edital.pdf">Duplicado</a>
        <a href="javascript:alert(1)">x.pdf</a>
        <a href="/pagina.html">Página</a>
      </body></html>`;
    const meta = extractHtmlMetadata(html, "https://riofilme.com.br/editais/edital-7/");
    expect(meta.title).toBe("Edital nº 7 & Anexos");
    expect(meta.pdfLinks).toEqual([
      { label: "Edital completo", url: "https://riofilme.com.br/arquivos/edital.pdf" },
      { label: "Anexo I", url: "https://outro.gov.br/anexo-i.PDF?v=2" },
    ]);
  });

  it("decodifica entidades do português", () => {
    expect(
      extractHtmlMetadata(
        "<title>Produ&ccedil;&atilde;o &Aacute;udio &ndash; S&eacute;rie</title>",
        "https://x.br",
      ).title,
    ).toBe("Produção Áudio – Série");
  });

  it("gera título a partir do nome do arquivo", () => {
    expect(titleFromFileName("Edital_SCEIC-FSA_10-2026.pdf")).toBe("Edital SCEIC FSA 10 2026");
  });
});
