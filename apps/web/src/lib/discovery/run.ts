import "server-only";

import {
  AUDIOVISUAL_RELEVANCE_LABELS,
  classifyAudiovisualRelevance,
  classifyPage,
  extractFields,
  findOfficialLink,
  hostOf,
  institutionName,
  IMPORTABLE_PAGE_TYPES,
  planDiscoveryQueries,
  triageSearchHit,
  type AudiovisualAssessment,
  type DiscoveryQuery,
  type KnownEdital,
  type PageClassification,
  type Proponent,
  type SiteKind,
} from "@lep/funding";
import { normalizeUrl } from "@lep/ingestion";
import { fetchUrlDocument, IngestError, type FetchedDocument } from "@/lib/editais/ingest";
import {
  allowed,
  countEditalLinks,
  importOpportunity,
  knownUrls,
  loadKnownEditais,
  loadRegulation,
  todayInBrasilia,
  type LoadedRegulation,
} from "@/lib/monitor/run";
import { loadPartnerTerritories, loadProponent } from "@/lib/proponent";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  discoveryLimitsFromEnv,
  searchProviderFromEnv,
  SearchProviderError,
  type DiscoveryLimits,
  type SearchProvider,
} from "./search-provider";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Descoberta web de oportunidades audiovisuais (ADR-0024).
 *
 *   busca (SearchProvider) → triagem barata → fonte oficial → classificação da página
 *   → relevância audiovisual (OBJETO, não tema) → prazo → pipeline da varredura
 *   (importOpportunity: evidências, elegibilidade, deduplicação, avistamentos, Match)
 *
 * Não audiovisual / encerrado / não é oportunidade → registro técnico
 * (core.discovery_candidates), nunca edital. Incerto → fila curta para um admin
 * confirmar. A mesma função atende o botão manual e o cron.
 */
export type DiscoveryResult = {
  orgId: string;
  status: "ok" | "partial" | "error" | "not_configured";
  provider: string | null;
  queriesPlanned: number;
  queriesRun: number;
  resultsReceived: number;
  uniqueUrls: number;
  analyzed: number;
  audiovisualYes: number;
  audiovisualNo: number;
  audiovisualUncertain: number;
  officialFound: number;
  imported: number;
  duplicates: number;
  alreadyKnown: number;
  newSources: number;
  failed: number;
  blocked: number;
  providerLimited: boolean;
  queries: string[];
  error?: string;
};

type Hit = {
  url: string;
  host: string;
  title: string;
  snippet: string;
  position: number;
  query: string;
  siteKind: SiteKind;
};

type CandidateRecord = {
  status: "imported" | "duplicate" | "suppressed" | "uncertain" | "failed";
  statusReason: string;
  officialUrl?: string | null;
  officialHost?: string | null;
  officialReason?: string | null;
  institution?: string | null;
  audiovisual?: AudiovisualAssessment | null;
  editalId?: string | null;
};

const SITE_PRIORITY: Record<SiteKind, number> = {
  official: 0,
  known_source: 0,
  unknown: 1,
  aggregator: 2,
  news: 3,
};

const emptyResult = (orgId: string, provider: string | null): DiscoveryResult => ({
  orgId,
  status: "ok",
  provider,
  queriesPlanned: 0,
  queriesRun: 0,
  resultsReceived: 0,
  uniqueUrls: 0,
  analyzed: 0,
  audiovisualYes: 0,
  audiovisualNo: 0,
  audiovisualUncertain: 0,
  officialFound: 0,
  imported: 0,
  duplicates: 0,
  alreadyKnown: 0,
  newSources: 0,
  failed: 0,
  blocked: 0,
  providerLimited: false,
  queries: [],
});

/** Tempo reservado para analisar uma página antes do fim do orçamento da execução. */
const CANDIDATE_RESERVE_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const safeNormalize = (url: string) => {
  try {
    return normalizeUrl(url);
  } catch {
    return url;
  }
};

async function saveCandidate(
  admin: Admin,
  orgId: string,
  hit: Hit,
  record: CandidateRecord,
  now: Date,
): Promise<void> {
  const av = record.audiovisual ?? null;
  const { error } = await admin.from("discovery_candidates").upsert(
    {
      org_id: orgId,
      url: hit.url.slice(0, 2000),
      host: hit.host.slice(0, 255),
      site_kind: hit.siteKind,
      title: hit.title.slice(0, 300) || null,
      snippet: hit.snippet.slice(0, 1000) || null,
      query: hit.query.slice(0, 300),
      official_url: record.officialUrl?.slice(0, 2000) ?? null,
      official_host: record.officialHost ?? null,
      official_reason: record.officialReason?.slice(0, 300) ?? null,
      institution: record.institution?.slice(0, 200) ?? null,
      audiovisual: av?.relevance ?? null,
      audiovisual_reasons: av?.reasons ?? [],
      audiovisual_evidence: av?.evidence?.quote.slice(0, 500) ?? null,
      status: record.status,
      status_reason: record.statusReason.slice(0, 300),
      edital_id: record.editalId ?? null,
      last_seen_at: now.toISOString(),
    },
    { onConflict: "org_id,url" },
  );
  if (error) console.error("Descoberta: candidato não registrado:", error.code);
}

/** Endereços já analisados pela descoberta (não são reprocessados; só atualiza "visto em"). */
async function seenCandidates(admin: Admin, orgId: string) {
  const { data, error } = await admin
    .from("discovery_candidates")
    .select("id, url, times_seen")
    .eq("org_id", orgId);
  if (error) return new Map<string, { id: string; times_seen: number }>();
  return new Map((data ?? []).map((row) => [safeNormalize(row.url), row]));
}

/** Consulta o provedor com uma nova tentativa em falhas transitórias (nunca em cota/chave). */
async function searchWithRetry(provider: SearchProvider, query: string, count: number) {
  try {
    return await provider.search({ query, count, page: 0 });
  } catch (error) {
    if (error instanceof SearchProviderError && error.retryable) {
      await sleep(1_500);
      return provider.search({ query, count, page: 0 });
    }
    throw error;
  }
}

type Analysis = {
  record: CandidateRecord;
  /** Pronto para o pipeline (somente audiovisual confirmado, oportunidade e sem prazo vencido). */
  ready?: {
    reference: FetchedDocument;
    referenceUrl: string;
    title: string;
    page: PageClassification;
    regulation: LoadedRegulation | null;
    notes: string[];
  };
};

/**
 * Analisa um resultado: fonte oficial, tipo da página, relevância audiovisual e
 * prazo. Também usada pelo "Importar para revisão" de um candidato incerto
 * (`skipAudiovisualGate`), que já teve a confirmação de uma pessoa.
 */
export async function analyzeCandidate(
  hit: Hit,
  {
    now,
    knownHosts,
    skipAudiovisualGate = false,
  }: { now: Date; knownHosts: Set<string>; skipAudiovisualGate?: boolean },
): Promise<Analysis> {
  if (!(await allowed(hit.url))) {
    return {
      record: { status: "failed", statusReason: "robots.txt do site não permite a leitura" },
    };
  }
  const discovered = await fetchUrlDocument(hit.url);

  // Fonte oficial: o próprio resultado (órgão público/fonte cadastrada) ou o link
  // encontrado no agregador/notícia. O agregador não substitui a fonte oficial.
  let reference = discovered;
  let referenceUrl = discovered.finalUrl ?? hit.url;
  let officialReason: string | null = null;
  const notes: string[] = [];
  if (hit.siteKind !== "official" && hit.siteKind !== "known_source") {
    const official = findOfficialLink({
      url: referenceUrl,
      links: [
        ...discovered.links,
        ...(discovered.metadata.pdf_links ?? []).map((link) => ({
          text: link.label,
          url: link.url,
        })),
      ],
    });
    if (official && (await allowed(official.url))) {
      try {
        reference = await fetchUrlDocument(official.url);
        referenceUrl = reference.finalUrl ?? official.url;
        officialReason = official.reason;
      } catch {
        notes.push(
          "Link da fonte oficial encontrado, mas inacessível: referência é a página descoberta.",
        );
      }
    }
    if (!officialReason) {
      if (hit.siteKind === "news") {
        return {
          record: {
            status: "suppressed",
            statusReason: "notícia sem link para a oportunidade oficial",
          },
        };
      }
      notes.push(
        `Fonte oficial não localizada automaticamente: referência é ${hit.host} (confirme no site da instituição).`,
      );
    }
  }
  const referenceHost = hostOf(referenceUrl);
  const institution = institutionName(reference.metadata.page_title, referenceUrl);
  const base = {
    officialUrl:
      officialReason || hit.siteKind === "official" || hit.siteKind === "known_source"
        ? referenceUrl
        : null,
    officialHost:
      officialReason || hit.siteKind === "official" || hit.siteKind === "known_source"
        ? referenceHost
        : null,
    officialReason:
      officialReason ??
      (hit.siteKind === "official"
        ? "domínio governamental"
        : hit.siteKind === "known_source"
          ? "fonte já cadastrada"
          : null),
    institution,
  };

  const title = (reference.suggestedTitle || hit.title || institution).slice(0, 300);
  const page = classifyPage({
    title,
    url: referenceUrl,
    text: reference.text ?? "",
    editalLinkCount: countEditalLinks(reference.links, referenceUrl),
  });
  if (!IMPORTABLE_PAGE_TYPES.has(page.type)) {
    return {
      record: {
        ...base,
        status: "suppressed",
        statusReason: `não é uma oportunidade (${page.reasons.join("; ")})`.slice(0, 300),
      },
    };
  }

  // Objeto audiovisual: título + página + regulamento em PDF (o regulamento decide dúvidas).
  const regulation = await loadRegulation(reference);
  const audiovisual = classifyAudiovisualRelevance({
    title,
    text: [reference.text ?? "", regulation?.document?.text ?? ""].join("\n"),
  });
  if (!skipAudiovisualGate && audiovisual.relevance !== "yes") {
    return {
      record: {
        ...base,
        audiovisual,
        status: audiovisual.relevance === "no" ? "suppressed" : "uncertain",
        statusReason: `${AUDIOVISUAL_RELEVANCE_LABELS[audiovisual.relevance]}: ${audiovisual.reasons[0]}`,
      },
    };
  }

  // Situação: edital já encerrado não entra como oportunidade ativa.
  const deadline = extractFields([
    { kind: "page", text: reference.text ?? "" },
    ...(regulation?.document?.text
      ? [{ kind: "pdf" as const, text: regulation.document.text }]
      : []),
  ]).deadline?.value;
  if (deadline && deadline < todayInBrasilia(now)) {
    return {
      record: {
        ...base,
        audiovisual,
        status: "suppressed",
        statusReason: `inscrições encerradas (${deadline})`,
      },
    };
  }

  if (referenceHost && !knownHosts.has(referenceHost) && hit.siteKind === "aggregator") {
    notes.push(`Encontrado no agregador ${hit.host}.`);
  }
  return {
    record: { ...base, audiovisual, status: "imported", statusReason: "" },
    ready: { reference, referenceUrl, title, page, regulation, notes },
  };
}

type SourceLite = { id: string; name: string; agency: string | null; list_url: string };

const sourcesByHost = (sources: SourceLite[]) =>
  new Map(sources.map((source) => [hostOf(source.list_url), source] as const));

type OrgContext = {
  proponent: Proponent;
  partnerTerritories: string[];
  knownEditais: KnownEdital[];
};

async function loadImportContext(admin: Admin, orgId: string): Promise<OrgContext> {
  return {
    proponent: await loadProponent(admin, orgId),
    partnerTerritories: await loadPartnerTerritories(admin, orgId),
    knownEditais: await loadKnownEditais(admin, orgId),
  };
}

/**
 * Entrega um candidato analisado ao pipeline da varredura (importOpportunity) e
 * atualiza o registro do candidato (status, motivo, edital).
 */
async function importAnalyzed(
  admin: Admin,
  orgId: string,
  hit: Hit,
  analysis: Analysis,
  {
    now,
    sourceByHost,
    context,
  }: { now: Date; sourceByHost: Map<string | null, SourceLite>; context: OrgContext },
): Promise<"imported" | "duplicate" | "ignored"> {
  const { record } = analysis;
  const { reference, referenceUrl, title, page, regulation, notes } = analysis.ready!;
  const referenceHost = hostOf(referenceUrl);
  const registered = referenceHost ? sourceByHost.get(referenceHost) : undefined;
  const outcome = await importOpportunity(
    admin,
    {
      orgId,
      origin: "web_discovery",
      sourceId: registered?.id ?? null,
      agency: registered?.agency ?? record.institution ?? null,
      now,
      ...context,
    },
    { title, url: referenceUrl },
    {
      classifyPages: true,
      fetched: reference,
      page,
      regulation,
      extraNotes: [
        `Encontrado pela descoberta web (consulta “${hit.query}”).`,
        ...notes,
        ...(record.audiovisual?.evidence
          ? [
              `Audiovisual (${AUDIOVISUAL_RELEVANCE_LABELS[record.audiovisual.relevance]}): “${record.audiovisual.evidence.quote}”`,
            ]
          : []),
      ],
      firstSightingReason:
        `Descoberta web: fonte oficial (${record.officialReason ?? "página descoberta"})`.slice(
          0,
          300,
        ),
      alsoSeenAt:
        safeNormalize(referenceUrl) !== safeNormalize(hit.url)
          ? {
              url: hit.url,
              title: hit.title || title,
              reason: `Descoberta web: resultado da consulta “${hit.query}”`.slice(0, 300),
            }
          : null,
    },
  );
  record.editalId = outcome.editalId;
  if (outcome.outcome === "duplicate") {
    record.status = "duplicate";
    record.statusReason = "mesmo edital já cadastrado (virou avistamento)";
    return "duplicate";
  }
  if (outcome.outcome === "ignored") {
    record.status = "suppressed";
    record.statusReason = "não é uma oportunidade";
    return "ignored";
  }
  record.status = "imported";
  record.statusReason =
    outcome.outcome === "restricted"
      ? "importado com restrição de elegibilidade (visível para a equipe)"
      : "importado para revisão da equipe";
  return "imported";
}

/**
 * "Importar para revisão" de um candidato INCERTO: uma pessoa (admin) confirmou que
 * o objeto é audiovisual. Reanalisa a página (fonte oficial, tipo, prazo) e usa o
 * mesmo pipeline. Nunca importa página que não seja oportunidade nem edital encerrado.
 */
export async function importUncertainCandidate(
  admin: Admin,
  orgId: string,
  candidateId: string,
  now: Date = new Date(),
): Promise<{ ok: boolean; message: string; editalId?: string | null }> {
  const { data: row } = await admin
    .from("discovery_candidates")
    .select("*")
    .eq("id", candidateId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!row || row.status !== "uncertain") {
    return { ok: false, message: "Candidato não encontrado ou já resolvido." };
  }
  const hit: Hit = {
    url: row.url,
    host: row.host,
    title: row.title ?? "",
    snippet: row.snippet ?? "",
    position: 0,
    query: row.query ?? "",
    siteKind: row.site_kind as SiteKind,
  };
  const { data: sources } = await admin.from("edital_sources").select("*").eq("org_id", orgId);
  const knownHosts = new Set(
    (sources ?? [])
      .map((source) => hostOf(source.list_url))
      .filter((host): host is string => !!host),
  );
  try {
    const analysis = await analyzeCandidate(hit, { now, knownHosts, skipAudiovisualGate: true });
    if (analysis.ready) {
      analysis.record.audiovisual = analysis.record.audiovisual && {
        ...analysis.record.audiovisual,
        reasons: [
          "confirmado como audiovisual por um administrador",
          ...analysis.record.audiovisual.reasons,
        ],
      };
      await importAnalyzed(admin, orgId, hit, analysis, {
        now,
        sourceByHost: sourcesByHost(sources ?? []),
        context: await loadImportContext(admin, orgId),
      });
    }
    await saveCandidate(admin, orgId, hit, analysis.record, now);
    return {
      ok: Boolean(analysis.ready),
      message: analysis.ready
        ? analysis.record.statusReason
        : `Não importado: ${analysis.record.statusReason}`,
      editalId: analysis.record.editalId ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof IngestError ? error.message : "Falha ao analisar a página.",
    };
  }
}

/** Executa a descoberta para uma organização. */
async function discoverForOrg(
  admin: Admin,
  orgId: string,
  {
    trigger,
    now,
    provider,
    limits,
  }: {
    trigger: "cron" | "manual";
    now: Date;
    provider: SearchProvider;
    limits: DiscoveryLimits;
  },
): Promise<DiscoveryResult> {
  const startedAt = new Date();
  const deadlineAt = Date.now() + limits.timeBudgetMs;
  const result = emptyResult(orgId, provider.name);

  const { data: sources } = await admin.from("edital_sources").select("*").eq("org_id", orgId);
  const knownHosts = new Set(
    (sources ?? [])
      .map((source) => hostOf(source.list_url))
      .filter((host): host is string => !!host),
  );
  const sourceByHost = sourcesByHost(sources ?? []);
  const favorites = (sources ?? [])
    .filter((source) => (source as { is_favorite?: boolean }).is_favorite)
    .map((source) => source.agency ?? source.name);

  const previousRuns = await admin
    .from("discovery_runs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  const plan: DiscoveryQuery[] = planDiscoveryQueries(
    { year: Number(todayInBrasilia(now).slice(0, 4)), favorites },
    { limit: limits.maxQueries, rotation: previousRuns.count ?? 0 },
  );
  result.queriesPlanned = plan.length;

  // 1) Busca (com limite, intervalo mínimo e uma nova tentativa em falha transitória).
  const hits = new Map<string, Hit>();
  let lastCall = 0;
  for (const item of plan) {
    if (Date.now() > deadlineAt) break;
    const wait = limits.minQueryIntervalMs - (Date.now() - lastCall);
    if (lastCall && wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const page = await searchWithRetry(provider, item.query, limits.resultsPerQuery);
      result.queriesRun++;
      result.queries.push(item.query);
      result.resultsReceived += page.results.length;
      for (const found of page.results) {
        const triage = triageSearchHit(found, { knownHosts });
        if (!triage.keep) continue;
        const key = safeNormalize(triage.url);
        if (hits.has(key)) continue;
        hits.set(key, {
          url: triage.url,
          host: triage.host,
          title: found.title,
          snippet: found.snippet,
          position: found.position,
          query: item.query,
          siteKind: triage.siteKind,
        });
      }
    } catch (error) {
      const kind = error instanceof SearchProviderError ? error.kind : "network";
      result.error = error instanceof Error ? error.message : "Falha no provedor de busca.";
      if (kind === "quota" || kind === "auth" || kind === "config") {
        result.providerLimited = kind === "quota";
        break;
      }
    }
  }
  result.uniqueUrls = hits.size;

  // 2) Já conhecidos (editais, documentos, avistamentos) e já analisados não são baixados de novo.
  const [known, seen] = await Promise.all([knownUrls(admin, orgId), seenCandidates(admin, orgId)]);
  const fresh: Hit[] = [];
  for (const [key, hit] of hits) {
    const previous = seen.get(key);
    if (known.has(key) || previous) {
      result.alreadyKnown++;
      if (previous) {
        await admin
          .from("discovery_candidates")
          .update({ last_seen_at: now.toISOString(), times_seen: (previous.times_seen ?? 1) + 1 })
          .eq("id", previous.id)
          .eq("org_id", orgId);
      }
      continue;
    }
    fresh.push(hit);
  }
  // Prioridade só organiza a execução: oficiais/fontes conhecidas primeiro, depois o ranking.
  fresh.sort(
    (a, b) => SITE_PRIORITY[a.siteKind] - SITE_PRIORITY[b.siteKind] || a.position - b.position,
  );

  // 3) Análise e pipeline existente.
  const context = await loadImportContext(admin, orgId);
  const newHosts = new Set<string>();

  for (const hit of fresh.slice(0, limits.maxCandidates)) {
    // Uma página (com fonte oficial e regulamento) pode levar vários segundos: não começa
    // outra perto do fim, para a execução terminar e gravar o histórico dentro do limite.
    if (Date.now() > deadlineAt - CANDIDATE_RESERVE_MS) {
      result.error = `Tempo da execução esgotado: ${
        Math.min(fresh.length, limits.maxCandidates) - result.analyzed
      } página(s) ficam para a próxima busca.`;
      break;
    }
    result.analyzed++;
    let record: CandidateRecord;
    try {
      const analysis = await analyzeCandidate(hit, { now, knownHosts });
      record = analysis.record;
      if (record.officialUrl && hit.siteKind !== "official" && hit.siteKind !== "known_source") {
        result.officialFound++;
      }
      if (record.statusReason.startsWith("robots")) result.blocked++;
      if (record.audiovisual?.relevance === "yes") result.audiovisualYes++;
      if (record.audiovisual?.relevance === "no") result.audiovisualNo++;
      if (record.audiovisual?.relevance === "uncertain") result.audiovisualUncertain++;

      if (analysis.ready) {
        const imported = await importAnalyzed(admin, orgId, hit, analysis, {
          now,
          sourceByHost,
          context,
        });
        if (imported === "duplicate") result.duplicates++;
        if (imported === "imported") result.imported++;
        const referenceHost = hostOf(analysis.ready.referenceUrl);
        if (referenceHost && !knownHosts.has(referenceHost) && record.officialHost) {
          newHosts.add(referenceHost);
        }
      }
    } catch (error) {
      record = {
        status: "failed",
        statusReason: error instanceof IngestError ? error.message : "falha ao analisar a página",
      };
      result.failed++;
    }
    await saveCandidate(admin, orgId, hit, record, now);
  }
  result.newSources = newHosts.size;
  result.status = result.error ? (result.queriesRun > 0 ? "partial" : "error") : "ok";

  const { error } = await admin.from("discovery_runs").insert({
    org_id: orgId,
    trigger,
    status: result.status,
    provider: provider.name,
    queries_planned: result.queriesPlanned,
    queries_run: result.queriesRun,
    results_received: result.resultsReceived,
    unique_urls: result.uniqueUrls,
    analyzed: result.analyzed,
    audiovisual_yes: result.audiovisualYes,
    audiovisual_no: result.audiovisualNo,
    audiovisual_uncertain: result.audiovisualUncertain,
    official_found: result.officialFound,
    imported: result.imported,
    duplicates: result.duplicates,
    already_known: result.alreadyKnown,
    new_sources: result.newSources,
    failed: result.failed,
    blocked: result.blocked,
    provider_limited: result.providerLimited,
    queries: result.queries,
    error: result.error?.slice(0, 500) ?? null,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
  });
  if (error) console.error("Descoberta: execução não registrada:", error.code);
  return result;
}

/**
 * Descoberta web (botão "Buscar novas oportunidades" e cron). Sem provedor
 * configurado, registra a execução como "not_configured" e não faz nenhuma busca.
 */
export async function runWebDiscovery(
  admin: Admin,
  options: {
    trigger: "cron" | "manual";
    orgId?: string;
    now?: Date;
    provider?: SearchProvider | null;
    limits?: DiscoveryLimits;
  },
): Promise<DiscoveryResult[]> {
  const now = options.now ?? new Date();
  const configured =
    options.provider !== undefined
      ? { provider: options.provider, problem: options.provider ? null : "Provedor ausente." }
      : searchProviderFromEnv();
  const limits = options.limits ?? discoveryLimitsFromEnv();

  let orgIds: string[] = [];
  if (options.orgId) {
    orgIds = [options.orgId];
  } else {
    const { data, error } = await admin.from("organizations").select("id");
    if (error) throw new Error(`Não foi possível ler as organizações: ${error.message}`);
    orgIds = (data ?? []).map((row) => row.id);
  }

  const results: DiscoveryResult[] = [];
  for (const orgId of orgIds) {
    if (!configured.provider) {
      const result = {
        ...emptyResult(orgId, null),
        status: "not_configured" as const,
        error: configured.problem ?? "Provedor de busca não configurado.",
      };
      await admin.from("discovery_runs").insert({
        org_id: orgId,
        trigger: options.trigger,
        status: "not_configured",
        error: result.error,
        finished_at: new Date().toISOString(),
      });
      results.push(result);
      continue;
    }
    results.push(
      await discoverForOrg(admin, orgId, {
        trigger: options.trigger,
        now,
        provider: configured.provider,
        limits,
      }),
    );
  }
  return results;
}

export type { Hit as DiscoveryHit };
