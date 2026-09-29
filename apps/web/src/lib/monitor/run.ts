import "server-only";

import { randomUUID } from "node:crypto";
import {
  assessEligibility,
  canonicalKey,
  classifyPage,
  extractFields,
  findDuplicateEdital,
  fingerprint,
  IMPORTABLE_PAGE_TYPES,
  opportunityKind,
  parseSourceAdapter,
  pickRegulationLink,
  RESTRICTED_ELIGIBILITY,
  selectCandidates,
  suggestionColumns,
  type KnownEdital,
  type PageClassification,
  type PageType,
  type Proponent,
  type TextSource,
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
  type FetchedDocument,
  findDuplicate,
  IngestError,
  removeStored,
  storeFetchedDocument,
} from "@/lib/editais/ingest";
import { checkEditalForChanges, textHash } from "@/lib/editais/changes";
import { persistMatches } from "@/lib/editais/matches";
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
  /** Editais já conhecidos com alteração/retificação detectada (etapa 10; pendentes de revisão). */
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

export function todayInBrasilia(now: Date) {
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

export async function allowed(rawUrl: string) {
  const url = new URL(rawUrl);
  return isAllowedByRobots(await robotsFor(url), url.pathname + url.search);
}

export type LoadedRegulation = { document?: FetchedDocument; notes: string[] };

/**
 * Baixa o regulamento (PDF) linkado na página do edital e lê o texto, sem guardar.
 * Falhas viram aviso: nunca impedem a importação do edital.
 */
export async function loadRegulation(page: FetchedDocument): Promise<LoadedRegulation | null> {
  if (page.mimeType !== "text/html") return null;
  const url = pickRegulationLink(page.metadata.pdf_links ?? []);
  if (!url) return null;
  try {
    if (!(await allowed(url))) {
      return { notes: ["Regulamento em PDF não lido: o robots.txt do site não permite."] };
    }
    const pdf = await fetchUrlDocument(url);
    if (pdf.mimeType !== "application/pdf") return null;
    return { document: pdf, notes: [] };
  } catch (error) {
    const message = error instanceof IngestError ? error.message : "falha ao baixar";
    return { notes: [`Regulamento em PDF não lido (${message}).`] };
  }
}

/** Guarda o regulamento como anexo do edital (cópia original + SHA-256). */
async function storeRegulation(
  admin: Admin,
  orgId: string,
  editalId: string,
  pdf: FetchedDocument,
  discoveredBy: ImportContext["origin"],
): Promise<void> {
  try {
    const stored = await storeFetchedDocument(admin, orgId, pdf);
    const { error } = await admin.from("edital_documents").insert({
      ...documentColumns(stored),
      metadata: {
        ...(documentColumns(stored).metadata as object),
        role: "regulation",
        discovered_by: discoveredBy,
      },
      org_id: orgId,
      edital_id: editalId,
      kind: "annex",
    });
    if (error) await removeStored(admin, stored.storagePath);
  } catch {
    // O texto já foi usado; falhar ao guardar a cópia não impede o edital.
  }
}

/** Editais da organização com a impressão digital (vazio se algo falhar: nunca bloqueia). */
export async function loadKnownEditais(admin: Admin, orgId: string): Promise<KnownEdital[]> {
  const withKey = await admin
    .from("editais")
    .select("id, title, deadline, canonical_key")
    .eq("org_id", orgId);
  const rows = withKey.error
    ? ((await admin.from("editais").select("id, title, deadline").eq("org_id", orgId)).data ?? [])
    : (withKey.data ?? []);
  return rows.map((row) => {
    const key = "canonical_key" in row ? (row.canonical_key as string | null) : null;
    const print = fingerprint({ title: row.title ?? "", deadline: row.deadline });
    // O número pode ter vindo do texto da página na importação.
    if (!print.number && key?.startsWith("n:")) print.number = key.slice(2);
    return { id: String(row.id), title: row.title ?? "Edital sem título", print };
  });
}

/** Avistamento: onde o edital apareceu (sem duplicar o mesmo endereço). */
export async function recordSighting(
  admin: Admin,
  sighting: {
    orgId: string;
    editalId: string;
    /** null = encontrado fora de uma fonte cadastrada (descoberta web). */
    sourceId: string | null;
    url: string;
    title: string;
    reason: string;
    now: Date;
  },
): Promise<void> {
  const { error } = await admin.from("edital_sightings").upsert(
    {
      org_id: sighting.orgId,
      edital_id: sighting.editalId,
      source_id: sighting.sourceId,
      url: sighting.url,
      title: sighting.title.slice(0, 300),
      match_reason: sighting.reason.slice(0, 300),
      last_seen_at: sighting.now.toISOString(),
    },
    { onConflict: "org_id,edital_id,url" },
  );
  if (error) console.error("Avistamento não registrado:", error.code);
}

/** Editais desta fonte verificados por execução (os verificados há mais tempo primeiro). */
const RECHECK_PER_SOURCE = 2;
const RECHECK_INTERVAL_MS = 20 * 60 * 60 * 1000;

async function recheckEditais(
  admin: Admin,
  source: SourceRow,
  now: Date,
  deadlineAt: number,
): Promise<number> {
  const { data, error } = await admin
    .from("editais")
    .select("*")
    .eq("org_id", source.org_id)
    .eq("source_id", source.id);
  if (error) return 0;
  const today = todayInBrasilia(now);
  const due = (data ?? [])
    .filter((row) => row.review_status !== "discarded" && row.official_url)
    .filter((row) => !row.deadline || String(row.deadline).slice(0, 10) >= today)
    .filter(
      (row) =>
        !row.last_checked_at ||
        now.getTime() - new Date(row.last_checked_at).getTime() >= RECHECK_INTERVAL_MS,
    )
    .sort((a, b) => String(a.last_checked_at ?? "").localeCompare(String(b.last_checked_at ?? "")))
    .slice(0, RECHECK_PER_SOURCE);
  let changed = 0;
  for (const row of due) {
    if (Date.now() > deadlineAt) break;
    if (row.official_url && !(await allowed(row.official_url))) continue;
    const check = await checkEditalForChanges(admin, source.org_id, row, now);
    if (check.status === "changed") {
      changed++;
      await persistMatches(admin, source.org_id, [String(row.id)], now);
    }
  }
  return changed;
}

type IgnoredPageType = "listing" | "result" | "rectification" | "news" | "institutional";

/** Páginas já classificadas como "não é oportunidade" (vazio se a migração não existir). */
export async function ignoredUrls(admin: Admin, orgId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from("monitor_ignored_urls")
    .select("url")
    .eq("org_id", orgId);
  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.url));
}

/** Quantos links da página parecem editais (índices de editais têm vários). */
export function countEditalLinks(links: { text: string; url: string }[], pageUrl: string): number {
  return selectCandidates(
    links,
    { listUrl: pageUrl, audiovisualOnly: true, linkContains: null },
    new Set(),
    50,
  ).length;
}

/** Links já conhecidos na organização (editais e documentos), para não importar de novo. */
export async function knownUrls(admin: Admin, orgId: string): Promise<Set<string>> {
  const [editais, documents, sightings] = await Promise.all([
    admin.from("editais").select("official_url").eq("org_id", orgId),
    admin.from("edital_documents").select("source_url, final_url").eq("org_id", orgId),
    // Endereços em que um edital já foi avistado (etapa 8; vazio antes da migração).
    admin.from("edital_sightings").select("url").eq("org_id", orgId),
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
  if (!sightings.error) sightings.data?.forEach((row) => add(row.url));
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
    // Etapa 8: editais já cadastrados, para reconhecer o mesmo edital vindo de outra fonte.
    const knownEditais = await loadKnownEditais(admin, source.org_id);
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
        knownEditais,
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

    // Etapa 10: verifica alterações/retificações nos editais já importados desta fonte.
    result.updated += await recheckEditais(admin, source, options.now, options.deadlineAt);
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
    knownEditais,
  }: {
    now: Date;
    proponent: Proponent;
    partnerTerritories: string[];
    classifyPages: boolean;
    knownEditais: KnownEdital[];
  },
): Promise<"imported" | "restricted" | "duplicate" | "ignored"> {
  const result = await importOpportunity(
    admin,
    {
      orgId: source.org_id,
      origin: "monitor",
      sourceId: source.id,
      agency: source.agency ?? source.name,
      now,
      proponent,
      partnerTerritories,
      knownEditais,
    },
    candidate,
    { classifyPages },
  );
  return result.outcome;
}

/** Quem importa e com que contexto (varredura de fonte cadastrada ou descoberta web). */
export type ImportContext = {
  orgId: string;
  origin: "monitor" | "web_discovery";
  /** Fonte cadastrada (null na descoberta web fora de fontes conhecidas). */
  sourceId: string | null;
  agency: string | null;
  now: Date;
  proponent: Proponent;
  partnerTerritories: string[];
  knownEditais: KnownEdital[];
};

export type ImportResult = {
  outcome: "imported" | "restricted" | "duplicate" | "ignored";
  editalId: string | null;
  pageType: PageType | null;
};

/**
 * Pipeline único de importação (varredura e descoberta web): duplicidade por
 * endereço/arquivo → classificação da página → impressão digital (avistamento) →
 * cópia original → edital "revisão pendente" → regulamento em PDF → extração com
 * evidência → elegibilidade → deduplicação → avistamento de origem → Match v2.
 */
export async function importOpportunity(
  admin: Admin,
  context: ImportContext,
  candidate: { title: string; url: string },
  options: {
    classifyPages: boolean;
    /** Documento já baixado (a descoberta web baixa antes para decidir). */
    fetched?: FetchedDocument;
    /** Classificação já feita pela descoberta web. */
    page?: PageClassification | null;
    /** Regulamento já lido (a descoberta web lê antes, para a decisão audiovisual). */
    regulation?: LoadedRegulation | null;
    /** Observações extras da extração (ex.: fonte oficial não localizada). */
    extraNotes?: string[];
    /** Outro endereço onde o edital foi encontrado (ex.: agregador/notícia). */
    alsoSeenAt?: { url: string; title: string; reason: string } | null;
    firstSightingReason?: string;
  },
): Promise<ImportResult> {
  const { orgId, now, knownEditais } = context;
  const fetched = options.fetched ?? (await fetchUrlDocument(candidate.url));
  const seenElsewhere = async (editalId: string) => {
    if (!options.alsoSeenAt) return;
    await recordSighting(admin, {
      orgId,
      editalId,
      sourceId: context.sourceId,
      ...options.alsoSeenAt,
      now,
    });
  };

  const sameFile = await findDuplicate(admin, orgId, fetched);
  if (sameFile) {
    // Descoberta web: registra onde mais o edital apareceu (a varredura mantém o comportamento).
    if (context.origin === "web_discovery") {
      await recordSighting(admin, {
        orgId,
        editalId: sameFile.editalId,
        sourceId: context.sourceId,
        url: candidate.url,
        title: candidate.title,
        reason: "Mesmo endereço ou mesmo arquivo já cadastrado",
        now,
      });
      await seenElsewhere(sameFile.editalId);
    }
    return { outcome: "duplicate", editalId: sameFile.editalId, pageType: null };
  }

  // Etapa 6: só oportunidades (ou páginas incertas) viram edital. As demais ficam
  // registradas com o motivo, visíveis em Fontes, e não são baixadas de novo.
  const page =
    options.page !== undefined
      ? options.page
      : options.classifyPages
        ? classifyPage({
            title: candidate.title,
            url: fetched.finalUrl ?? candidate.url,
            text: fetched.text ?? "",
            editalLinkCount: countEditalLinks(fetched.links, fetched.finalUrl ?? candidate.url),
          })
        : null;
  if (page && !IMPORTABLE_PAGE_TYPES.has(page.type)) {
    // A descoberta web registra o motivo na própria tabela técnica (não em "Páginas ignoradas").
    if (context.origin === "monitor") {
      await admin.from("monitor_ignored_urls").upsert(
        {
          org_id: orgId,
          source_id: context.sourceId,
          url: candidate.url,
          title: candidate.title.slice(0, 300),
          page_type: page.type as IgnoredPageType,
          reasons: page.reasons,
          last_seen_at: now.toISOString(),
        },
        { onConflict: "org_id,url" },
      );
    }
    return { outcome: "ignored", editalId: null, pageType: page.type };
  }

  // Etapa 8: mesmo edital já cadastrado (ex.: visto no site do órgão e agora num
  // agregador) → só registra o avistamento, sem criar outro edital.
  const print = fingerprint({
    title: candidate.title,
    text: fetched.text,
    deadline: extractFields([{ kind: "page", text: fetched.text ?? "" }]).deadline?.value,
  });
  const match = findDuplicateEdital(print, knownEditais);
  if (match?.verdict === "same") {
    await recordSighting(admin, {
      orgId,
      editalId: match.id,
      sourceId: context.sourceId,
      url: candidate.url,
      title: candidate.title,
      reason: `Mesmo edital: ${match.reason}`,
      now,
    });
    await seenElsewhere(match.id);
    return { outcome: "duplicate", editalId: match.id, pageType: page?.type ?? null };
  }

  const document = await storeFetchedDocument(admin, orgId, fetched);

  const columns = documentColumns(document);
  const { data: editalId, error } = await admin.rpc("create_edital_with_document", {
    p_org_id: orgId,
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
    p_metadata: { ...(columns.metadata as object), discovered_by: context.origin },
  });
  if (error || !editalId) {
    await removeStored(admin, document.storagePath);
    throw new Error(error?.message ?? "falha ao criar edital");
  }

  // Etapa 7: o regulamento em PDF linkado na página também é lido (texto, sem OCR)
  // e guardado como anexo — é a fonte oficial das regras e da evidência.
  const regulation =
    options.regulation !== undefined ? options.regulation : await loadRegulation(fetched);
  if (regulation?.document) {
    await storeRegulation(admin, orgId, String(editalId), regulation.document, context.origin);
  }
  const regulationText = regulation?.document?.text;
  const sources: TextSource[] = [
    {
      kind: fetched.mimeType === "application/pdf" ? "pdf" : "page",
      text: document.text ?? "",
      label: fetched.mimeType === "application/pdf" ? "Documento (PDF)" : "Página do edital",
    },
    ...(regulationText
      ? [{ kind: "pdf" as const, text: regulationText, label: "Regulamento (PDF)" }]
      : []),
  ];

  // Sugestões por regras de texto (sem IA), com evidência. O edital fica com revisão pendente.
  const fields = extractFields(sources);
  const suggestions = suggestionColumns(fields, {
    today: todayInBrasilia(now),
    pdf: regulation?.document?.pdf ?? fetched.pdf,
  });
  // Diretrizes LEP 1 e 2 + taxonomia (etapa 5): a elegibilidade é um eixo próprio.
  // Restrição territorial fica visível com motivo e trecho; a triagem continua pendente.
  const eligibility = assessEligibility(
    [candidate.title, ...sources.map((item) => item.text)].join("\n"),
    { proponent: context.proponent, partnerTerritories: context.partnerTerritories },
  );
  await admin
    .from("editais")
    .update({
      origin: context.origin,
      source_id: context.sourceId,
      discovered_at: now.toISOString(),
      agency: context.agency,
      summary: document.metadata.description ?? null,
      ...suggestions,
      extraction_notes: [
        ...(suggestions.extraction_notes as string[]),
        ...(regulation?.notes ?? []),
        ...(options.extraNotes ?? []),
      ],
      extracted_at: now.toISOString(),
      eligible_territories: eligibility.territories,
      eligibility_status: eligibility.status,
      eligibility_reason: eligibility.reason,
      eligibility_evidence: eligibility.evidence,
      eligibility_source: "auto",
      eligibility_checked_at: now.toISOString(),
      page_type: page?.type === "opportunity" || page?.type === "uncertain" ? page.type : null,
      opportunity_kind: page?.kind ?? opportunityKind(candidate.title),
      page_type_reasons: page?.reasons ?? ["classificação de página desligada nesta fonte"],
      // Linha de base para a detecção de alterações (etapa 10).
      content_hash: textHash(fetched),
      last_checked_at: now.toISOString(),
    })
    .eq("id", editalId)
    .eq("org_id", orgId);

  // Deduplicação (etapa 8): chave canônica, possível duplicado e o avistamento de origem.
  await admin
    .from("editais")
    .update({
      canonical_key: canonicalKey(print),
      possible_duplicate_of: match?.verdict === "possible" ? match.id : null,
      possible_duplicate_reason: match?.verdict === "possible" ? match.reason : null,
    })
    .eq("id", editalId)
    .eq("org_id", orgId);
  await recordSighting(admin, {
    orgId,
    editalId: String(editalId),
    sourceId: context.sourceId,
    url: candidate.url,
    title: candidate.title,
    reason: options.firstSightingReason ?? "Primeira fonte onde o edital foi encontrado",
    now,
  });
  await seenElsewhere(String(editalId));
  knownEditais.push({ id: String(editalId), title: candidate.title, print });
  // Etapa 9: grava o Match v2 do edital novo com os projetos da organização.
  await persistMatches(admin, orgId, [String(editalId)], now);
  return {
    outcome: RESTRICTED_ELIGIBILITY.has(eligibility.status) ? "restricted" : "imported",
    editalId: String(editalId),
    pageType: page?.type ?? null,
  };
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
    // select("*"): funciona antes e depois da migração das favoritas (20261008120000).
    .select("*")
    .eq("active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true });
  if (options.orgId) query = query.eq("org_id", options.orgId);
  const { data: rows, error } = await query;
  if (error) throw new Error(`Não foi possível ler as fontes: ${error.message}`);
  // Favoritas ⭐ primeiro (prioridade dentro do tempo da execução); depois, as verificadas há mais tempo.
  const sources = [...(rows ?? [])].sort(
    (a, b) =>
      Number(Boolean((b as { is_favorite?: boolean }).is_favorite)) -
      Number(Boolean((a as { is_favorite?: boolean }).is_favorite)),
  );

  const results: SourceResult[] = [];
  const contexts = new Map<string, { proponent: Proponent; partnerTerritories: string[] }>();
  // Agrupa as linhas do histórico desta execução (uma por fonte).
  const executionId = randomUUID();
  for (const source of sources) {
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

export type SourcePreview = {
  ok: boolean;
  /** Mensagem principal (erro ou resumo). */
  message: string;
  finalUrl: string | null;
  linksFound: number;
  candidatesFound: number;
  /** Amostra das primeiras oportunidades: como a varredura as classificaria. */
  samples: {
    title: string;
    url: string;
    pageType: string | null;
    reasons: string[];
    deadline: string | null;
  }[];
  warnings: string[];
};

/**
 * "Testar fonte" (etapa 11): mesmo caminho da varredura — robots.txt, página de
 * listagem, seleção com o adaptador e classificação de algumas páginas — sem
 * gravar nada. Serve para validar a configuração no site real antes de ativar.
 */
export async function previewSource(
  source: Pick<SourceRow, "list_url" | "audiovisual_only" | "link_contains" | "adapter_config">,
  { sampleSize = 3, timeBudgetMs = 25_000 }: { sampleSize?: number; timeBudgetMs?: number } = {},
): Promise<SourcePreview> {
  const deadlineAt = Date.now() + timeBudgetMs;
  robotsCache.clear();
  const empty = { finalUrl: null, linksFound: 0, candidatesFound: 0, samples: [] };
  const { adapter, warning } = parseSourceAdapter(source.adapter_config);
  const warnings = warning ? [warning] : [];
  try {
    if (!(await allowed(source.list_url))) {
      return {
        ok: false,
        message: "O robots.txt do site não permite a leitura desta página.",
        warnings,
        ...empty,
      };
    }
    const page = await safeFetch(source.list_url, { timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024 });
    if (detectKind(page.contentType, page.body) !== "html") {
      return { ok: false, message: "O endereço não é uma página web.", warnings, ...empty };
    }
    const links = extractLinks(decodeHtml(page.contentType, page.body), page.finalUrl);
    const candidates = selectCandidates(
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
      50,
    );
    if (links.length < 5) {
      warnings.push(
        "Poucos links na página: ela pode ser montada por JavaScript ou exigir login (a varredura lê só o HTML).",
      );
    }
    if (candidates.length === 0) {
      warnings.push(
        "Nenhum link parece oportunidade: confira o endereço, o filtro de endereço e se a fonte é só de audiovisual.",
      );
    }

    const samples: SourcePreview["samples"] = [];
    for (const candidate of candidates.slice(0, sampleSize)) {
      if (Date.now() > deadlineAt) break;
      if (!(await allowed(candidate.url))) {
        samples.push({
          ...candidate,
          pageType: null,
          reasons: ["bloqueada pelo robots.txt"],
          deadline: null,
        });
        continue;
      }
      try {
        const fetched = await fetchUrlDocument(candidate.url);
        const classification = adapter.classifyPages
          ? classifyPage({
              title: candidate.title,
              url: fetched.finalUrl ?? candidate.url,
              text: fetched.text ?? "",
              editalLinkCount: countEditalLinks(fetched.links, fetched.finalUrl ?? candidate.url),
            })
          : null;
        samples.push({
          ...candidate,
          pageType: classification?.type ?? null,
          reasons: classification?.reasons ?? ["classificação desligada nesta fonte"],
          deadline:
            extractFields([{ kind: "page", text: fetched.text ?? "" }]).deadline?.value ?? null,
        });
      } catch (error) {
        samples.push({
          ...candidate,
          pageType: null,
          reasons: [error instanceof IngestError ? error.message : "falha ao abrir a página"],
          deadline: null,
        });
      }
    }
    return {
      ok: true,
      message: `${links.length} link(s) na página; ${candidates.length} parecem oportunidades.`,
      finalUrl: page.finalUrl,
      linksFound: links.length,
      candidatesFound: candidates.length,
      samples,
      warnings,
    };
  } catch (error) {
    const message =
      error instanceof UnsafeUrlError || error instanceof FetchError || error instanceof IngestError
        ? error.message
        : "Falha inesperada ao testar a fonte.";
    return { ok: false, message, warnings, ...empty };
  }
}
