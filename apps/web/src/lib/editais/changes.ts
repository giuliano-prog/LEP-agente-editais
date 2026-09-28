import "server-only";

import { createHash } from "node:crypto";
import {
  changeSummary,
  diffFields,
  extractFields,
  isRectification,
  pickRegulationLink,
  toEdital,
  type TextSource,
} from "@lep/funding";
import type { Json } from "@lep/db";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import {
  documentColumns,
  fetchUrlDocument,
  IngestError,
  removeStored,
  storeFetchedDocument,
  type FetchedDocument,
} from "./ingest";

type Client = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

export type ChangeCheck =
  | { status: "unchanged" | "baseline" | "skipped"; message: string }
  | { status: "changed"; message: string; changeId: string | null }
  | { status: "error"; message: string };

const MAX_RECTIFICATIONS = 3;

/** Hash do TEXTO (não do HTML): mudanças só de layout não geram alerta. */
export function textHash(document: FetchedDocument): string {
  if (document.mimeType === "application/pdf") return document.sha256;
  const text = (document.text ?? "").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(text).digest("hex");
}

async function storeAs(
  client: Client,
  orgId: string,
  editalId: string,
  fetched: FetchedDocument,
  kind: "rectification" | "annex" | "other",
  role: string,
): Promise<string | null> {
  const stored = await storeFetchedDocument(client, orgId, fetched);
  const columns = documentColumns(stored);
  const { data, error } = await client
    .from("edital_documents")
    .insert({
      ...columns,
      metadata: { ...(columns.metadata as object), role, discovered_by: "change_check" } as Json,
      org_id: orgId,
      edital_id: editalId,
      kind,
    })
    .select("id")
    .single();
  if (error || !data) {
    await removeStored(client, stored.storagePath);
    return null;
  }
  return data.id;
}

/**
 * Verifica se o edital mudou (etapa 10): baixa de novo a página oficial, segue
 * retificações/erratas novas e o regulamento, extrai os campos e compara com os
 * valores atuais. Registra a alteração como PENDENTE — nada é sobrescrito.
 * Primeira verificação (sem hash anterior) só registra a linha de base e
 * retificações; não compara campos (evita tratar edições da equipe como alteração).
 */
export async function checkEditalForChanges(
  client: Client,
  orgId: string,
  editalRow: Record<string, unknown>,
  now: Date = new Date(),
): Promise<ChangeCheck> {
  const edital = toEdital(editalRow);
  const previousHash = typeof editalRow.content_hash === "string" ? editalRow.content_hash : null;
  if (!edital.officialUrl) return { status: "skipped", message: "Edital sem link oficial." };

  const touch = (hash: string | null) =>
    client
      .from("editais")
      .update({ last_checked_at: now.toISOString(), ...(hash ? { content_hash: hash } : {}) })
      .eq("id", edital.id)
      .eq("org_id", orgId);

  let page: FetchedDocument;
  try {
    page = await fetchUrlDocument(edital.officialUrl);
  } catch (error) {
    await touch(null);
    return {
      status: "error",
      message:
        error instanceof IngestError ? error.message : "Não foi possível acessar o link oficial.",
    };
  }

  const documents = await client
    .from("edital_documents")
    .select("source_url, final_url, sha256")
    .eq("edital_id", edital.id)
    .eq("org_id", orgId);
  const knownUrls = new Set(
    (documents.data ?? []).flatMap((row) => [row.source_url, row.final_url]).filter(Boolean),
  );
  const knownHashes = new Set((documents.data ?? []).map((row) => row.sha256));

  // Retificações / erratas novas linkadas na página oficial.
  const links = [
    ...(page.metadata.pdf_links ?? []),
    ...page.links.map((link) => ({ label: link.text, url: link.url })),
  ];
  const rectificationLinks = [
    ...new Map(
      links
        .filter((link) => isRectification(link.label, link.url) && !knownUrls.has(link.url))
        .map((link) => [link.url, link]),
    ).values(),
  ].slice(0, MAX_RECTIFICATIONS);

  const sources: TextSource[] = [];
  const documentIds: string[] = [];
  const rectificationIds: string[] = [];
  for (const link of rectificationLinks) {
    try {
      const fetched = await fetchUrlDocument(link.url);
      if (knownHashes.has(fetched.sha256)) continue;
      const id = await storeAs(client, orgId, edital.id, fetched, "rectification", "rectification");
      if (id) {
        documentIds.push(id);
        rectificationIds.push(id);
      }
      if (fetched.text)
        sources.push({
          kind: "pdf",
          text: fetched.text,
          label: `Retificação: ${link.label}`.slice(0, 120),
        });
    } catch {
      // Uma retificação inacessível não impede o resto da verificação.
    }
  }

  const hash = textHash(page);
  if (hash === previousHash && rectificationIds.length === 0) {
    await touch(hash);
    return { status: "unchanged", message: "Nenhuma alteração desde a última verificação." };
  }

  // Regulamento (PDF): versão nova é guardada; o texto entra na comparação.
  const regulationUrl = pickRegulationLink(page.metadata.pdf_links ?? []);
  if (regulationUrl) {
    try {
      const regulation = await fetchUrlDocument(regulationUrl);
      if (!knownHashes.has(regulation.sha256) && previousHash) {
        const id = await storeAs(client, orgId, edital.id, regulation, "annex", "regulation");
        if (id) documentIds.push(id);
      }
      if (regulation.text)
        sources.push({ kind: "pdf", text: regulation.text, label: "Regulamento (PDF)" });
    } catch {
      // segue só com a página
    }
  }
  sources.push({
    kind: page.mimeType === "application/pdf" ? "pdf" : "page",
    text: page.text ?? "",
    label: "Página do edital",
  });

  if (!previousHash && rectificationIds.length === 0) {
    await touch(hash);
    return {
      status: "baseline",
      message: "Linha de base registrada: próximas verificações comparam com esta.",
    };
  }

  const changes = diffFields(edital, extractFields(sources));
  if (changes.length === 0 && rectificationIds.length === 0) {
    await touch(hash);
    return {
      status: "unchanged",
      message: "O texto mudou, mas os campos extraídos são os mesmos.",
    };
  }

  // Cópia da página alterada (evidência da versão nova).
  if (page.mimeType === "text/html" && previousHash && hash !== previousHash) {
    const id = await storeAs(client, orgId, edital.id, page, "other", "page_version").catch(
      () => null,
    );
    if (id) documentIds.push(id);
  }

  const summary = changeSummary(changes, rectificationIds.length);
  const { data, error } = await client
    .from("edital_changes")
    .insert({
      org_id: orgId,
      edital_id: edital.id,
      kind: rectificationIds.length > 0 ? "rectification" : "fields_changed",
      summary: summary.slice(0, 500),
      changes: changes as unknown as Json,
      document_ids: documentIds,
    })
    .select("id")
    .single();
  await touch(hash);
  if (error) console.error("Alteração não registrada:", error.code);
  return { status: "changed", message: summary, changeId: data?.id ?? null };
}
