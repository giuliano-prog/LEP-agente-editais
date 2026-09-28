import { describe, expect, it } from "vitest";
import { extractPdfText, PdfTextError } from "./pdf-text";
import { makePdf } from "./testing/make-pdf";

describe("extractPdfText (pdfjs-dist, sem OCR)", () => {
  it("lê o texto de todas as páginas, com acentos", async () => {
    const pdf = makePdf([
      ["Edital Ficticio de Producao 2026", "Inscrições até 30/11/2026."],
      [
        "Valor total: R$ 3.000.000,00",
        "Podem participar produtoras de todo o território nacional.",
      ],
    ]);
    const result = await extractPdfText(pdf);
    expect(result).toMatchObject({ pages: 2, pagesRead: 2, scanned: false, truncated: false });
    expect(result.text).toContain("Inscrições até 30/11/2026.");
    expect(result.text).toContain("R$ 3.000.000,00");
    expect(result.text).toContain("território nacional");
  });

  it("respeita o limite de páginas e marca como truncado", async () => {
    const pdf = makePdf([
      ["Pagina um com texto suficiente para contar letras aqui."],
      ["Pagina dois"],
      ["Pagina tres"],
    ]);
    const result = await extractPdfText(pdf, { maxPages: 1 });
    expect(result).toMatchObject({ pages: 3, pagesRead: 1, truncated: true });
    expect(result.text).not.toContain("dois");
  });

  it("PDF sem camada de texto (como um digitalizado) é sinalizado, sem OCR", async () => {
    const result = await extractPdfText(makePdf([[]]));
    expect(result.scanned).toBe(true);
    expect(result.text).toBe("");
  });

  it("recusa arquivo que não é PDF e PDF corrompido com erro claro", async () => {
    await expect(extractPdfText(Buffer.from("<html></html>"))).rejects.toThrow(PdfTextError);
    await expect(extractPdfText(Buffer.from("%PDF-1.4\nlixo"))).rejects.toThrow(
      "Não foi possível ler o texto do PDF.",
    );
  });

  it("não altera o buffer recebido", async () => {
    const pdf = makePdf([["Texto"]]);
    const copy = Buffer.from(pdf);
    await extractPdfText(pdf);
    expect(pdf.equals(copy)).toBe(true);
  });
});
