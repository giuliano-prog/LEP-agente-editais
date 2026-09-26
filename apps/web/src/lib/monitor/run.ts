import "server-only";

import { findDeadline, findTotalAmount, selectCandidates, statusFromDeadline } from "@lep/funding";
import {
  decodeHtml,
  detectKind,
  extractLinks,
  FetchError,
  isAllowedByRobots,
  normalizeUrl,
  parseRobots,
  safeFetch,
  UnsafeUrlError,
  type RobotsRules,
} from "@lep/ingestion";
import {
  documentColumns,
  findDuplicate,
  IngestError,
  ingestFromUrl,
  removeStored,
} from "@/lib/editais/ingest";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Limites por execução (cabem no tempo máximo de uma função da Vercel). */
const MAX_IMPORTS_PER_SOURCE = 5;
const TIME_BUDGET_MS = 50_000;

export type SourceRow = {
  id: string;
  org_id: string;
  name: string;
  agency: string | null;
  list_url: string;
  audiovisual_only: boolean;
  link_contains: string | null;
};

export type SourceResult = {
  sourceId: string;
  name: string;
  status: "ok" | "error" | "blocked";
  linksFound: number;
  candidates: number;
  imported: number;
  skipped: number;
  error?: string;
};

function todayInBrasilia(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

const robotsCache = new Map<string, RobotsRules>();

/** robots.txt da origem. 4xx/ausente = tudo permitido (padrão da web). */
async function robotsFor(url: URL): Promise<RobotsRules> {
  const cached = robotsCache.get(url.origin);
  if (cached) return cached;
  let rules: RobotsRules = { allow: [], disallow: [] };
  try {
    const response = await safeFetch(`${url.origin}/robots.txt`, {
      maxBytes: 512 * 1024,
      timeoutMs: 8_000,
    });
    rules = parseRobots(response.body.toString("utf-8"));
  } catch {
    // robots.txt inexistente ou inacessível: sem restrições declaradas.
  }
  robotsCache.set(url.origin, rules);
  return rules;
}

async function allowed(rawUrl: string) {
  const url = new URL(rawUrl);
  return isAllowedByRobots(await robotsFor(url), url.pathname + url.search);
}

/** Links já conhecidos na organização (editais e documentos), para não importar de novo. */
async function knownUrls(admin: Admin, orgId: string): Promise<Set<string>> {
  const [editais, documents] = await Promise.all([
    admin.from("editais").select("official_url").eq("org_id", orgId),
    admin.from("edital_documents").select("source_url, final_url").eq("org_id", orgId),
  ]);
  const urls = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    try {
      urls.add(normalizeUrl(value));
    } catch {
      // ignora valores inválidos
    }
  };
  editais.data?.forEach((row) => add(row.official_url));
  documents.data?.forEach((row) => {
    add(row.source_url);
    add(row.final_url);
  });
  return urls;
}

/** Varre uma fonte: lista → candidatos → importa como "revisão pendente". */
export async function scanSource(
  admin: Admin,
  source: SourceRow,
  options: { now: Date; deadlineAt: number },
): Promise<SourceResult> {
  const result: SourceResult = {
    sourceId: source.id,
    name: source.name,
    status: "ok",
    linksFound: 0,
    candidates: 0,
    imported: 0,
    skipped: 0,
  };

  try {
    if (!(await allowed(source.list_url))) {
      return {
        ...result,
        status: "blocked",
        error: "O robots.txt do site não permite a leitura desta página.",
      };
    }
    const page = await safeFetch(source.list_url, { timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024 });
    if (detectKind(page.contentType, page.body) !== "html") {
      return { ...result, status: "error", error: "O endereço da fonte não é uma página web." };
    }

    const links = extractLinks(decodeHtml(page.contentType, page.body), page.finalUrl);
    result.linksFound = links.length;
    const known = await knownUrls(admin, source.org_id);
    const candidates = selectCandidates(
      links,
      {
        listUrl: page.finalUrl,
        audiovisualOnly: source.audiovisual_only,
        linkContains: source.link_contains,
      },
      known,
      MAX_IMPORTS_PER_SOURCE * 2,
    );
    result.candidates = candidates.length;

    for (const candidate of candidates) {
      if (result.imported >= MAX_IMPORTS_PER_SOURCE || Date.now() > options.deadlineAt) break;
      if (!(await allowed(candidate.url))) {
        result.skipped++;
        continue;
      }
      const imported = await importCandidate(admin, source, candidate, options.now).catch(
        (error) => {
          console.error(
            `Varredura: falha ao importar ${candidate.url}:`,
            error instanceof Error ? error.message : error,
          );
          return false;
        },
      );
      if (imported) result.imported++;
      else result.skipped++;
    }
  } catch (error) {
    const message =
      error instanceof UnsafeUrlError || error instanceof FetchError || error instanceof IngestError
        ? error.message
        : "Falha inesperada na varredura.";
    return { ...result, status: "error", error: message };
  }
  return result;
}

async function importCandidate(
  admin: Admin,
  source: SourceRow,
  candidate: { title: string; url: string },
  now: Date,
): Promise<boolean> {
  const document = await ingestFromUrl(admin, source.org_id, candidate.url);
  if (await findDuplicate(admin, source.org_id, document)) {
    await removeStored(admin, document.storagePath);
    return false;
  }

  const columns = documentColumns(document);
  const { data: editalId, error } = await admin.rpc("create_edital_with_document", {
    p_org_id: source.org_id,
    p_title: candidate.title,
    p_official_url: candidate.url,
    p_kind: "main",
    p_source: columns.source,
    p_source_url: columns.source_url,
    p_final_url: columns.final_url,
    p_storage_path: columns.storage_path,
    p_file_name: columns.file_name,
    p_mime_type: columns.mime_type,
    p_size_bytes: columns.size_bytes,
    p_sha256: columns.sha256,
    p_http_status: columns.http_status,
    p_metadata: { ...(columns.metadata as object), discovered_by: "monitor" },
  });
  if (error || !editalId) {
    await removeStored(admin, document.storagePath);
    throw new Error(error?.message ?? "falha ao criar edital");
  }

  // Sugestões por regras de texto (sem IA). O edital fica com revisão pendente.
  const text = document.text ?? "";
  const deadline = findDeadline(text);
  await admin
    .from("editais")
    .update({
      origin: "monitor",
      source_id: source.id,
      discovered_at: now.toISOString(),
      agency: source.agency ?? source.name,
      summary: document.metadata.description ?? null,
      deadline: deadline ? `${deadline}T23:59:00-03:00` : null,
      status: statusFromDeadline(deadline, todayInBrasilia(now)),
      total_amount: findTotalAmount(text),
    })
    .eq("id", editalId)
    .eq("org_id", source.org_id);
  return true;
}

/**
 * Executa a varredura das fontes ativas (todas as organizações, ou uma só) e
 * registra o histórico em core.monitor_runs.
 */
export async function runMonitor(
  admin: Admin,
  options: { trigger: "cron" | "manual"; orgId?: string; now?: Date },
): Promise<SourceResult[]> {
  const now = options.now ?? new Date();
  const deadlineAt = Date.now() + TIME_BUDGET_MS;
  robotsCache.clear();

  let query = admin
    .from("edital_sources")
    .select("id, org_id, name, agency, list_url, audiovisual_only, link_contains")
    .eq("active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true });
  if (options.orgId) query = query.eq("org_id", options.orgId);
  const { data: sources, error } = await query;
  if (error) throw new Error(`Não foi possível ler as fontes: ${error.message}`);

  const results: SourceResult[] = [];
  for (const source of sources ?? []) {
    if (Date.now() > deadlineAt) break;
    const startedAt = new Date().toISOString();
    const result = await scanSource(admin, source, { now, deadlineAt });
    results.push(result);

    await Promise.all([
      admin.from("monitor_runs").insert({
        org_id: source.org_id,
        source_id: source.id,
        trigger: options.trigger,
        status: result.status,
        links_found: result.linksFound,
        candidates: result.candidates,
        imported: result.imported,
        skipped: result.skipped,
        error: result.error ?? null,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      }),
      admin
        .from("edital_sources")
        .update({
          last_run_at: new Date().toISOString(),
          last_status: result.status,
          last_error: result.error ?? null,
          last_imported: result.imported,
        })
        .eq("id", source.id),
    ]);
  }
  return results;
}
