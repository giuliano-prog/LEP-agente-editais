import "server-only";

import { randomUUID } from "node:crypto";
import {
  assessEligibility,
  classifyPage,
  IMPORTABLE_PAGE_TYPES,
  opportunityKind,
  parseSourceAdapter,
  RESTRICTED_ELIGIBILITY,
  findDeadline,
  findTotalAmount,
  selectCandidates,
  statusFromDeadline,
  type Proponent,
} from "@lep/funding";
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
  fetchUrlDocument,
  findDuplicate,
  IngestError,
  removeStored,
  storeFetchedDocument,
} from "@/lib/editais/ingest";
import { loadPartnerTerritories, loadProponent } from "@/lib/proponent";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Limite de tempo por execução (cabe no tempo máximo de uma função da Vercel).
 * O limite de importações por fonte vem do adaptador (padrão 5). */
const TIME_BUDGET_MS = 50_000;

export type SourceRow = {
  id: string;
  org_id: string;
  name: string;
  agency: string | null;
  list_url: string;
  audiovisual_only: boolean;
  link_contains: string | null;
  /** Configuração do adaptador (etapa 6); ausente antes da migração. */
  adapter_config?: unknown;
};

/** Resumo de uma fonte em uma execução (exibido no "Verificar agora" e gravado no histórico). */
export type SourceResult = {
  sourceId: string;
  name: string;
  status: "ok" | "error" | "blocked";
  linksFound: number;
  /** Links que parecem oportunidades (inclui os já conhecidos). */
  found: number;
  /** Candidatos ainda desconhecidos (antes do limite por execução). */
  candidates: number;
  /** Importados como novos (entram com revisão pendente). */
  imported: number;
  /** Alterações detectadas em oportunidades conhecidas (etapa de retificações; hoje sempre 0). */
  updated: number;
  /** Já conhecidos (mesmo link ou mesmo arquivo). */
  duplicates: number;
  /** Novos com restrição de elegibilidade (território, pessoa física…): entram visíveis, em revisão. */
  rejected: number;
  /** Novos que aguardam revisão humana. */
  pendingReview: number;
  /** Links que o robots.txt não permite ler. */
  blockedByRobots: number;
  /** Falhas ao importar um item (a fonte continua). */
  failed: number;
  /** Páginas lidas e não transformadas em edital (resultado, notícia, institucional…). */
  ignored: number;
  error?: string;
  /** Aviso não fatal (ex.: configuração da fonte inválida, usando o padrão). */
  warning?: string;
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

type IgnoredPageType = "listing" | "result" | "rectification" | "news" | "institutional";

/** Páginas já classificadas como "não é oportunidade" (vazio se a migração não existir). */
async function ignoredUrls(admin: Admin, orgId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from("monitor_ignored_urls")
    .select("url")
    .eq("org_id", orgId);
  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.url));
}

/** Quantos links da página parecem editais (índices de editais têm vários). */
function countEditalLinks(links: { text: string; url: string }[], pageUrl: string): number {
  return selectCandidates(
    links,
    { listUrl: pageUrl, audiovisualOnly: true, linkContains: null },
    new Set(),
    50,
  ).length;
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
  options: {
    now: Date;
    deadlineAt: number;
    proponent: Proponent;
    partnerTerritories: string[];
  },
): Promise<SourceResult> {
  const result: SourceResult = {
    sourceId: source.id,
    name: source.name,
    status: "ok",
    linksFound: 0,
    found: 0,
    candidates: 0,
    imported: 0,
    updated: 0,
    duplicates: 0,
    rejected: 0,
    pendingReview: 0,
    blockedByRobots: 0,
    failed: 0,
    ignored: 0,
  };
  const { adapter, warning } = parseSourceAdapter(source.adapter_config);
  if (warning) result.warning = warning;

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
    // Páginas já classificadas como "não é oportunidade" não são lidas de novo.
    const ignored = await ignoredUrls(admin, source.org_id);
    // Seleciona sem excluir os conhecidos, para contar duplicadas separadamente.
    const opportunities = selectCandidates(
      links,
      {
        listUrl: page.finalUrl,
        audiovisualOnly: source.audiovisual_only,
        linkContains: source.link_contains,
        linkExcludes: adapter.linkExcludes,
        titleExcludes: adapter.titleExcludes,
        allowPdfLinks: adapter.allowPdfLinks,
      },
      new Set(),
      100,
    );
    const candidates = opportunities
      .filter((item) => !known.has(item.url) && !ignored.has(item.url))
      .slice(0, adapter.maxImports * 2);
    result.found = opportunities.length;
    result.duplicates =
      opportunities.length - opportunities.filter((item) => !known.has(item.url)).length;
    result.candidates = candidates.length;

    for (const candidate of candidates) {
      if (result.imported >= adapter.maxImports || Date.now() > options.deadlineAt) break;
      if (!(await allowed(candidate.url))) {
        result.blockedByRobots++;
        continue;
      }
      const outcome = await importCandidate(admin, source, candidate, {
        ...options,
        classifyPages: adapter.classifyPages,
      }).catch((error) => {
        console.error(
          `Varredura: falha ao importar ${candidate.url}:`,
          error instanceof Error ? error.message : error,
        );
        return "failed" as const;
      });
      if (outcome === "imported" || outcome === "restricted") {
        // Com restrição também entra (visível, em triagem pendente): nada é descartado sozinho.
        result.imported++;
        result.pendingReview++;
        if (outcome === "restricted") result.rejected++;
      } else if (outcome === "duplicate") {
        result.duplicates++;
      } else if (outcome === "ignored") {
        result.ignored++;
      } else {
        result.failed++;
      }
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
  {
    now,
    proponent,
    partnerTerritories,
    classifyPages,
  }: { now: Date; proponent: Proponent; partnerTerritories: string[]; classifyPages: boolean },
): Promise<"imported" | "restricted" | "duplicate" | "ignored"> {
  const fetched = await fetchUrlDocument(candidate.url);
  if (await findDuplicate(admin, source.org_id, fetched)) return "duplicate";

  // Etapa 6: só oportunidades (ou páginas incertas) viram edital. As demais ficam
  // registradas com o motivo, visíveis em Fontes, e não são baixadas de novo.
  const page = classifyPages
    ? classifyPage({
        title: candidate.title,
        url: fetched.finalUrl ?? candidate.url,
        text: fetched.text ?? "",
        editalLinkCount: countEditalLinks(fetched.links, fetched.finalUrl ?? candidate.url),
      })
    : null;
  if (page && !IMPORTABLE_PAGE_TYPES.has(page.type)) {
    await admin.from("monitor_ignored_urls").upsert(
      {
        org_id: source.org_id,
        source_id: source.id,
        url: candidate.url,
        title: candidate.title.slice(0, 300),
        page_type: page.type as IgnoredPageType,
        reasons: page.reasons,
        last_seen_at: now.toISOString(),
      },
      { onConflict: "org_id,url" },
    );
    return "ignored";
  }

  const document = await storeFetchedDocument(admin, source.org_id, fetched);

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
  // Diretrizes LEP 1 e 2 + taxonomia (etapa 5): a elegibilidade é um eixo próprio.
  // Restrição territorial fica visível com motivo e trecho; a triagem continua pendente.
  const eligibility = assessEligibility(`${candidate.title}\n${text}`, {
    proponent,
    partnerTerritories,
  });
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
      eligible_territories: eligibility.territories,
      eligibility_status: eligibility.status,
      eligibility_reason: eligibility.reason,
      eligibility_evidence: eligibility.evidence,
      eligibility_source: "auto",
      eligibility_checked_at: now.toISOString(),
      page_type: page?.type === "opportunity" || page?.type === "uncertain" ? page.type : null,
      opportunity_kind: page?.kind ?? opportunityKind(candidate.title),
      page_type_reasons: page?.reasons ?? ["classificação de página desligada nesta fonte"],
    })
    .eq("id", editalId)
    .eq("org_id", source.org_id);
  return RESTRICTED_ELIGIBILITY.has(eligibility.status) ? "restricted" : "imported";
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
    .select("id, org_id, name, agency, list_url, audiovisual_only, link_contains, adapter_config")
    .eq("active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true });
  if (options.orgId) query = query.eq("org_id", options.orgId);
  const { data: sources, error } = await query;
  if (error) throw new Error(`Não foi possível ler as fontes: ${error.message}`);

  const results: SourceResult[] = [];
  const contexts = new Map<string, { proponent: Proponent; partnerTerritories: string[] }>();
  // Agrupa as linhas do histórico desta execução (uma por fonte).
  const executionId = randomUUID();
  for (const source of sources ?? []) {
    if (Date.now() > deadlineAt) break;
    const startedAt = new Date().toISOString();
    if (!contexts.has(source.org_id)) {
      contexts.set(source.org_id, {
        proponent: await loadProponent(admin, source.org_id),
        partnerTerritories: await loadPartnerTerritories(admin, source.org_id),
      });
    }
    const result = await scanSource(admin, source, {
      now,
      deadlineAt,
      ...contexts.get(source.org_id)!,
    });
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
        rejected: result.rejected,
        skipped: result.blockedByRobots + result.failed,
        found: result.found,
        duplicates: result.duplicates,
        updated: result.updated,
        pending_review: result.pendingReview,
        blocked_by_robots: result.blockedByRobots,
        failed: result.failed,
        ignored_pages: result.ignored,
        execution_id: executionId,
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
