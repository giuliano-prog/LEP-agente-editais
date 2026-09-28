import "server-only";

import { randomUUID } from "node:crypto";
import {
  decodeHtml,
  detectKind,
  extractDescription,
  extractHtmlMetadata,
  extractLinks,
  htmlToText,
  FetchError,
  isPdf,
  type PageLink,
  safeFetch,
  sha256,
  titleFromFileName,
  UnsafeUrlError,
} from "@lep/ingestion";
import type { Json } from "@lep/db";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import { DOCUMENTS_BUCKET, isValidUploadPath, MAX_DOCUMENT_BYTES } from "./constants";

/** Cliente com sessão do usuário (RLS) ou cliente de serviço (varredura automática). */
type Supabase = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

/** Documento pronto para ser registrado em core.edital_documents. */
export type IngestedDocument = {
  source: "url" | "upload";
  sourceUrl: string | null;
  finalUrl: string | null;
  storagePath: string;
  fileName: string | null;
  mimeType: "application/pdf" | "text/html";
  sizeBytes: number;
  sha256: string;
  httpStatus: number | null;
  suggestedTitle: string;
  metadata: {
    page_title?: string | null;
    description?: string | null;
    pdf_links?: { label: string; url: string }[];
  };
  /** Texto legível da página (somente HTML; não é gravado). Usado pela varredura. */
  text?: string;
};

export class IngestError extends Error {}

export type Duplicate = { editalId: string; title: string };

/** Documento baixado, ainda não guardado (a varredura decide antes se vale guardar). */
export type FetchedDocument = Omit<IngestedDocument, "storagePath"> & {
  body: Buffer;
  /** Links da página (somente HTML; não são gravados). */
  links: PageLink[];
};

/** Baixa uma URL pública (página ou PDF) e lê os metadados, sem guardar nada. */
export async function fetchUrlDocument(rawUrl: string): Promise<FetchedDocument> {
  let fetched;
  try {
    fetched = await safeFetch(rawUrl, { maxBytes: MAX_DOCUMENT_BYTES });
  } catch (error) {
    if (error instanceof UnsafeUrlError || error instanceof FetchError)
      throw new IngestError(error.message);
    throw new IngestError("Não foi possível acessar o link.");
  }

  const kind = detectKind(fetched.contentType, fetched.body);
  if (!kind) throw new IngestError("O link não é uma página web nem um PDF.");

  const mimeType = kind === "pdf" ? "application/pdf" : "text/html";
  const lastSegment = decodeURIComponent(
    new URL(fetched.finalUrl).pathname.split("/").filter(Boolean).pop() ?? "",
  );

  let metadata: IngestedDocument["metadata"] = {};
  let suggestedTitle = titleFromFileName(lastSegment || new URL(fetched.finalUrl).hostname);
  let text: string | undefined;
  let links: PageLink[] = [];
  if (kind === "html") {
    const source = decodeHtml(fetched.contentType, fetched.body);
    const html = extractHtmlMetadata(source, fetched.finalUrl);
    metadata = {
      page_title: html.title,
      description: extractDescription(source),
      pdf_links: html.pdfLinks,
    };
    if (html.title) suggestedTitle = html.title.slice(0, 300);
    text = htmlToText(source).slice(0, 200_000);
    links = extractLinks(source, fetched.finalUrl);
  }

  return {
    source: "url",
    sourceUrl: rawUrl.trim(),
    finalUrl: fetched.finalUrl,
    fileName: kind === "pdf" ? lastSegment || null : null,
    mimeType,
    sizeBytes: fetched.body.byteLength,
    sha256: sha256(fetched.body),
    httpStatus: fetched.status,
    suggestedTitle,
    metadata,
    text,
    body: fetched.body,
    links,
  };
}

/** Guarda a cópia original de um documento baixado no Storage (<org_id>/captures/...). */
export async function storeFetchedDocument(
  supabase: Supabase,
  orgId: string,
  fetched: FetchedDocument,
): Promise<IngestedDocument> {
  const extension = fetched.mimeType === "application/pdf" ? "pdf" : "html";
  const storagePath = `${orgId}/captures/${randomUUID()}.${extension}`;
  await upload(supabase, storagePath, fetched.body, fetched.mimeType);
  return {
    source: fetched.source,
    sourceUrl: fetched.sourceUrl,
    finalUrl: fetched.finalUrl,
    storagePath,
    fileName: fetched.fileName,
    mimeType: fetched.mimeType,
    sizeBytes: fetched.sizeBytes,
    sha256: fetched.sha256,
    httpStatus: fetched.httpStatus,
    suggestedTitle: fetched.suggestedTitle,
    metadata: fetched.metadata,
    text: fetched.text,
  };
}

/**
 * Baixa uma URL pública (página ou PDF), guarda a cópia original no Storage e
 * devolve os metadados. Não usa IA: título e links de PDF vêm do próprio HTML.
 */
export async function ingestFromUrl(
  supabase: Supabase,
  orgId: string,
  rawUrl: string,
): Promise<IngestedDocument> {
  return storeFetchedDocument(supabase, orgId, await fetchUrlDocument(rawUrl));
}

/**
 * Valida um PDF que o navegador já enviou ao Storage: confere o caminho, o
 * tamanho e a assinatura do arquivo (%PDF) e calcula o hash.
 */
export async function ingestFromUpload(
  supabase: Supabase,
  orgId: string,
  storagePath: string,
  fileName: string,
): Promise<IngestedDocument> {
  if (!isValidUploadPath(orgId, storagePath)) throw new IngestError("Arquivo enviado inválido.");

  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(storagePath);
  if (error || !data)
    throw new IngestError("Não foi possível ler o arquivo enviado. Tente novamente.");

  const body = Buffer.from(await data.arrayBuffer());
  if (body.byteLength > MAX_DOCUMENT_BYTES) {
    await removeStored(supabase, storagePath);
    throw new IngestError("O arquivo excede o limite de 25 MB.");
  }
  if (!isPdf(body)) {
    await removeStored(supabase, storagePath);
    throw new IngestError("O arquivo enviado não é um PDF válido.");
  }

  const safeName = fileName.replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 200) || "documento.pdf";
  return {
    source: "upload",
    sourceUrl: null,
    finalUrl: null,
    storagePath,
    fileName: safeName,
    mimeType: "application/pdf",
    sizeBytes: body.byteLength,
    sha256: sha256(body),
    httpStatus: null,
    suggestedTitle: titleFromFileName(safeName),
    metadata: {},
  };
}

/** Procura documento idêntico (mesmo hash) ou edital com o mesmo link oficial na organização. */
export async function findDuplicate(
  supabase: Supabase,
  orgId: string,
  document: Pick<IngestedDocument, "sha256" | "sourceUrl" | "finalUrl">,
): Promise<Duplicate | null> {
  const { data: sameFile } = await supabase
    .from("edital_documents")
    .select("edital_id, editais ( title )")
    .eq("org_id", orgId)
    .eq("sha256", document.sha256)
    .limit(1)
    .maybeSingle();
  if (sameFile) {
    return {
      editalId: String(sameFile.edital_id),
      title: sameFile.editais?.title ?? "Edital sem título",
    };
  }

  const urls = [document.sourceUrl, document.finalUrl].filter((url): url is string => Boolean(url));
  if (urls.length > 0) {
    const { data: sameUrl } = await supabase
      .from("editais")
      .select("id, title")
      .eq("org_id", orgId)
      .in("official_url", urls)
      .limit(1)
      .maybeSingle();
    if (sameUrl)
      return { editalId: String(sameUrl.id), title: sameUrl.title ?? "Edital sem título" };
  }
  return null;
}

/** Campos do documento no formato das colunas de core.edital_documents. */
export function documentColumns(document: IngestedDocument) {
  return {
    source: document.source,
    source_url: document.sourceUrl,
    final_url: document.finalUrl,
    storage_path: document.storagePath,
    file_name: document.fileName,
    mime_type: document.mimeType,
    size_bytes: document.sizeBytes,
    sha256: document.sha256,
    http_status: document.httpStatus,
    metadata: document.metadata as Json,
  };
}

async function upload(supabase: Supabase, path: string, body: Buffer, contentType: string) {
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, body, { contentType, upsert: false, cacheControl: "3600" });
  if (error) throw new IngestError("Não foi possível guardar a cópia do documento.");
}

/** Remove um arquivo do Storage (usado quando o cadastro não é concluído). */
export async function removeStored(supabase: Supabase, path: string) {
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
}
