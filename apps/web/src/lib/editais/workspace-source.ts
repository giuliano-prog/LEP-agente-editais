import "server-only";

import { decodeHtml, extractPdfText, htmlToText, isPdf } from "@lep/ingestion";
import type { Edital } from "@lep/funding";
import type { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "./constants";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ordem de leitura: regulamento principal, retificações, anexos, FAQ. */
const KIND_ORDER = ["main", "rectification", "annex", "faq"];
const MAX_DOCUMENTS = 4;
const MAX_CHARS = 400_000;

export type EditalText = {
  text: string;
  /** pdf/page = documentos guardados; fields = só o cadastro do edital. */
  source: "pdf" | "page" | "fields";
  documentsRead: number;
  notes: string[];
};

/** Texto mínimo a partir do cadastro, quando não há documento legível guardado. */
export function textFromFields(edital: Edital): string {
  return [
    edital.summary,
    ...edital.eligibilityCriteria,
    edital.requiredDocuments.length ? "DA DOCUMENTAÇÃO" : null,
    ...edital.requiredDocuments,
    ...Object.values(edital.fieldEvidence).map((evidence) => evidence?.snippet ?? null),
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join("\n");
}

/**
 * Lê o texto dos documentos do edital guardados no bucket privado (com a sessão do
 * usuário — RLS do Storage). Sem documento legível, usa o cadastro do edital.
 * O texto não é gravado: só as regras extraídas, com trechos (ADR-0026).
 */
export async function loadEditalText(
  supabase: Supabase,
  orgId: string,
  edital: Edital,
): Promise<EditalText> {
  const { data } = await supabase
    .from("edital_documents")
    .select("id, kind, storage_path, mime_type, created_at")
    .eq("edital_id", edital.id)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  const documents = (data ?? [])
    .filter((doc) => KIND_ORDER.includes(doc.kind) && doc.storage_path)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, MAX_DOCUMENTS);

  const parts: string[] = [];
  const notes: string[] = [];
  let pdfRead = 0;
  let pagesRead = 0;
  for (const doc of documents) {
    const download = await supabase.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
    if (download.error || !download.data) {
      notes.push("Um documento do edital não pôde ser lido do armazenamento.");
      continue;
    }
    const body = Buffer.from(await download.data.arrayBuffer());
    try {
      if (doc.mime_type === "application/pdf" && isPdf(body)) {
        const result = await extractPdfText(body, { maxPages: 80, timeoutMs: 20_000 });
        if (result.scanned)
          notes.push("Há PDF digitalizado (sem texto): confira esse documento à mão.");
        if (result.text.trim()) {
          parts.push(result.text);
          pdfRead++;
        }
      } else if (doc.mime_type === "text/html") {
        const text = htmlToText(decodeHtml("text/html", body));
        if (text.trim()) {
          parts.push(text);
          pagesRead++;
        }
      }
    } catch {
      notes.push("Um documento do edital não pôde ser lido (arquivo corrompido ou protegido).");
    }
  }

  const text = parts.join("\n\n").slice(0, MAX_CHARS);
  if (text.trim()) {
    return {
      text,
      source: pdfRead > 0 ? "pdf" : "page",
      documentsRead: pdfRead + pagesRead,
      notes,
    };
  }
  notes.push(
    documents.length === 0
      ? "Nenhum documento do edital guardado: o checklist usou só o cadastro. Anexe o regulamento (PDF) na aba Documentos para uma leitura completa."
      : "Os documentos guardados não têm texto legível: o checklist usou só o cadastro do edital.",
  );
  return { text: textFromFields(edital), source: "fields", documentsRead: 0, notes };
}
