import "server-only";

import { decodeHtml, extractPdfText, htmlToText, isPdf } from "@lep/ingestion";
import { DOCUMENT_KIND_LABELS, type Edital } from "@lep/funding";
import type { Json } from "@lep/db";
import type { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET } from "./constants";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ordem de leitura: regulamento principal, retificações, anexos, FAQ. */
const KIND_ORDER = ["main", "rectification", "annex", "faq"];
const MAX_DOCUMENTS = 4;
const MAX_CHARS = 400_000;
const MAX_PAGES = 80;
/** Páginas HTML viram "páginas" de ~4.000 caracteres (para citar a posição do trecho). */
const HTML_PAGE_CHARS = 4_000;

export type EditalText = {
  text: string;
  /** pdf/page = documentos guardados; fields = só o cadastro do edital. */
  source: "pdf" | "page" | "fields";
  documentsRead: number;
  notes: string[];
};

/** Texto de um documento do edital, por página (base das evidências "documento · página · trecho"). */
export type EditalDocumentPages = {
  documentId: string | null;
  label: string;
  source: "pdf" | "page" | "fields";
  pages: string[];
  truncated: boolean;
};

export type EditalPages = {
  documents: EditalDocumentPages[];
  notes: string[];
  /** Quantos documentos foram extraídos agora (o resto veio do cache em core.edital_texts). */
  extractedNow: number;
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

function splitHtmlPages(text: string): string[] {
  const pages: string[] = [];
  for (let start = 0; start < text.length; start += HTML_PAGE_CHARS) {
    pages.push(text.slice(start, start + HTML_PAGE_CHARS));
  }
  return pages;
}

const asPages = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((page): page is string => typeof page === "string") : [];

/**
 * Páginas dos documentos do edital guardados no bucket privado, com a sessão do usuário
 * (RLS do Storage). Usa o cache `core.edital_texts` quando o SHA-256 do documento não
 * mudou; senão extrai e grava o cache (Diretoria/ADM). Sem documento legível, usa o cadastro.
 */
export async function loadEditalPages(
  supabase: Supabase,
  orgId: string,
  edital: Edital,
  options: { persist?: boolean } = {},
): Promise<EditalPages> {
  const [{ data }, { data: cached }] = await Promise.all([
    supabase
      .from("edital_documents")
      .select("id, kind, storage_path, mime_type, sha256, file_name, created_at")
      .eq("edital_id", edital.id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("edital_texts")
      .select("document_id, sha256, label, source, pages, truncated")
      .eq("edital_id", edital.id)
      .eq("org_id", orgId),
  ]);

  const documents = (data ?? [])
    .filter((doc) => KIND_ORDER.includes(doc.kind) && doc.storage_path)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .slice(0, MAX_DOCUMENTS);

  const result: EditalDocumentPages[] = [];
  const notes: string[] = [];
  let extractedNow = 0;
  let totalChars = 0;

  for (const doc of documents) {
    const kindLabel =
      DOCUMENT_KIND_LABELS[doc.kind as keyof typeof DOCUMENT_KIND_LABELS] ?? "Documento";
    const label = `${kindLabel}${doc.file_name ? ` — ${doc.file_name}` : ""}`.slice(0, 300);
    const hit = (cached ?? []).find(
      (row) => row.document_id === doc.id && row.sha256 === doc.sha256,
    );
    if (hit) {
      const pages = asPages(hit.pages);
      if (pages.some((page) => page.trim())) {
        result.push({
          documentId: doc.id,
          label: hit.label,
          source: hit.source === "page" ? "page" : "pdf",
          pages,
          truncated: hit.truncated,
        });
        totalChars += pages.join("").length;
      }
      continue;
    }

    const download = await supabase.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
    if (download.error || !download.data) {
      notes.push("Um documento do edital não pôde ser lido do armazenamento.");
      continue;
    }
    const body = Buffer.from(await download.data.arrayBuffer());
    let entry: EditalDocumentPages | null = null;
    try {
      if (doc.mime_type === "application/pdf" && isPdf(body)) {
        const read = await extractPdfText(body, { maxPages: MAX_PAGES, timeoutMs: 20_000 });
        if (read.scanned)
          notes.push("Há PDF digitalizado (sem texto): confira esse documento à mão.");
        if (read.text.trim()) {
          entry = {
            documentId: doc.id,
            label,
            source: "pdf",
            pages: read.pageTexts,
            truncated: read.truncated,
          };
        }
      } else if (doc.mime_type === "text/html") {
        const text = htmlToText(decodeHtml("text/html", body));
        if (text.trim()) {
          entry = {
            documentId: doc.id,
            label,
            source: "page",
            pages: splitHtmlPages(text),
            truncated: false,
          };
        }
      }
    } catch {
      notes.push("Um documento do edital não pôde ser lido (arquivo corrompido ou protegido).");
    }
    if (!entry || totalChars >= MAX_CHARS) continue;
    result.push(entry);
    totalChars += entry.pages.join("").length;
    extractedNow++;

    if (options.persist) {
      // Cache best-effort: sem permissão (Equipe) ou sem a migração, só não grava.
      const row = {
        label: entry.label,
        sha256: doc.sha256,
        pages: entry.pages as unknown as Json,
        page_count: entry.pages.length,
        char_count: entry.pages.join("").length,
        truncated: entry.truncated,
      };
      const existing = (cached ?? []).some((cachedRow) => cachedRow.document_id === doc.id);
      const write = existing
        ? await supabase
            .from("edital_texts")
            .update({ ...row, extracted_at: new Date().toISOString() })
            .eq("document_id", doc.id)
            .eq("org_id", orgId)
        : await supabase.from("edital_texts").insert({
            ...row,
            org_id: orgId,
            edital_id: edital.id,
            document_id: doc.id,
            source: entry.source,
          });
      if (write.error) console.error("Cache do texto do edital não gravado:", write.error.code);
    }
  }

  if (result.length > 0) return { documents: result, notes, extractedNow };

  notes.push(
    documents.length === 0
      ? "Nenhum documento do edital guardado: o checklist usou só o cadastro. Anexe o regulamento (PDF) na aba Documentos para uma leitura completa."
      : "Os documentos guardados não têm texto legível: o checklist usou só o cadastro do edital.",
  );
  return {
    documents: [
      {
        documentId: null,
        label: "Cadastro do edital (sem documento legível)",
        source: "fields",
        pages: [textFromFields(edital)],
        truncated: false,
      },
    ],
    notes,
    extractedNow,
  };
}

/** Texto corrido do edital (compatível com o checklist da ADR-0026), a partir das páginas. */
export async function loadEditalText(
  supabase: Supabase,
  orgId: string,
  edital: Edital,
): Promise<EditalText> {
  const { documents, notes } = await loadEditalPages(supabase, orgId, edital, { persist: true });
  const fromFields = documents.every((doc) => doc.source === "fields");
  return {
    text: documents
      .map((doc) => doc.pages.join("\n\n"))
      .join("\n\n")
      .slice(0, MAX_CHARS),
    source: fromFields ? "fields" : documents.some((doc) => doc.source === "pdf") ? "pdf" : "page",
    documentsRead: fromFields ? 0 : documents.length,
    notes,
  };
}
