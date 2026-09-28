/// <reference path="./pdfjs-worker.d.ts" />
/**
 * Texto de PDF em TypeScript com pdfjs-dist (Mozilla), sem OCR.
 *
 * - Só lê a camada de texto: PDF escaneado (imagem) devolve pouco ou nenhum texto
 *   e é sinalizado como `scanned` para revisão humana.
 * - Sem execução de código do PDF (sem XFA/WebAssembly; pdfjs 6 não usa eval), sem fontes do sistema,
 *   com limite de páginas, de caracteres e de tempo.
 */
import { isPdf } from "./documents";

export type PdfText = {
  text: string;
  /** Páginas no arquivo. */
  pages: number;
  /** Páginas efetivamente lidas (limite `maxPages`). */
  pagesRead: number;
  /** Quase sem texto: provavelmente digitalizado (imagem) — não há OCR. */
  scanned: boolean;
  truncated: boolean;
};

export class PdfTextError extends Error {}

export type PdfTextOptions = { maxPages?: number; maxChars?: number; timeoutMs?: number };

type TextItem = { str?: string; hasEOL?: boolean };

async function loadPdfjs() {
  // Worker no mesmo processo: o módulo do worker define globalThis.pdfjsWorker e o
  // pdfjs o usa em vez de abrir um Worker (importação literal = incluída no deploy).
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  // Build "legacy": compatível com Node (sem APIs de navegador).
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

export async function extractPdfText(
  data: Uint8Array,
  { maxPages = 60, maxChars = 400_000, timeoutMs = 20_000 }: PdfTextOptions = {},
): Promise<PdfText> {
  if (!isPdf(data)) throw new PdfTextError("O arquivo não é um PDF.");
  const pdfjs = await loadPdfjs();

  const task = pdfjs.getDocument({
    // Cópia: o pdfjs transfere (e esvazia) o buffer recebido.
    data: new Uint8Array(data),
    // pdfjs 6 não usa eval; desliga XFA, WebAssembly e buscas pelo worker.
    enableXfa: false,
    useWasm: false,
    useWorkerFetch: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: false,
    verbosity: 0,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfTextError("Tempo esgotado ao ler o PDF.")), timeoutMs);
  });

  try {
    return await Promise.race([read(), timeout]);
  } catch (error) {
    if (error instanceof PdfTextError) throw error;
    const name = (error as { name?: string })?.name;
    throw new PdfTextError(
      name === "PasswordException"
        ? "O PDF é protegido por senha."
        : "Não foi possível ler o texto do PDF.",
    );
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => undefined);
  }

  async function read(): Promise<PdfText> {
    const document = await task.promise;
    const pagesRead = Math.min(document.numPages, maxPages);
    const parts: string[] = [];
    let length = 0;
    for (let number = 1; number <= pagesRead && length < maxChars; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = (content.items as TextItem[])
        .map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : " "))
        .join("")
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        .trim();
      parts.push(text);
      length += text.length + 2;
      page.cleanup();
    }
    const joined = parts.join("\n\n");
    const text = joined.slice(0, maxChars);
    const letters = text.replace(/[^\p{L}]/gu, "").length;
    return {
      text,
      pages: document.numPages,
      pagesRead,
      // Menos de ~40 letras por página lida: camada de texto ausente (imagem).
      scanned: letters < 40 * Math.max(1, pagesRead),
      truncated: joined.length > maxChars || document.numPages > pagesRead,
    };
  }
}
