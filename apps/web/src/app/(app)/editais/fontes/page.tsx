import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { can } from "@lep/core";
import { PAGE_TYPE_LABELS, parseSourceAdapter, type PageType } from "@lep/funding";
import { DbErrorNotice } from "@/components/db-error-notice";
import { NavIcon } from "@/components/nav-icon";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, type BadgeTone } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { limitLabel } from "@/lib/discovery/labels";
import { discoveryLimitsFromEnv } from "@/lib/discovery/search-provider";
import { findSameSource, safeExternalUrl } from "@/lib/editais/links";
import { CATALOG_KIND_LABELS, SOURCE_CATALOG } from "@/lib/monitor/catalog";
import { SUGGESTED_SOURCES } from "@/lib/monitor/suggested";
import { createClient } from "@/lib/supabase/server";
import {
  addSuggestedSource,
  addSuggestedSources,
  deleteSource,
  dismissDiscoveryCandidate,
  forgetIgnoredUrl,
  importDiscoveryCandidate,
  toggleFavorite,
  toggleSource,
} from "./actions";
import {
  CatalogSourceForm,
  DiscoveredSourceForm,
  SearchPanel,
  SourceConfigForm,
  SourceForm,
  TestSourceButton,
} from "./source-forms";

export const metadata: Metadata = { title: "Buscar Editais" };

// "Fontes Cadastradas" e "Buscar na Web" rodam nesta página (Server Actions):
// mesmo tempo máximo das rotas de cron na Vercel (segundos).
export const maxDuration = 60;

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ok: { label: "OK", tone: "ok" },
  error: { label: "Erro", tone: "bad" },
  blocked: { label: "Bloqueada pelo site", tone: "warn" },
};

const DISCOVERY_STATUS: Record<string, string> = {
  ok: "OK",
  partial: "Parcial",
  error: "Erro",
  not_configured: "Provedor não configurado",
};

const dateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

/** Filtros da lista de fontes (favoritas ⭐ continuam destacadas em todos). */
const SOURCE_FILTERS = {
  todas: { label: "Todas", test: () => true },
  favoritas: { label: "⭐ Favoritas", test: (s: SourceView) => s.isFavorite },
  ativas: { label: "Ativas", test: (s: SourceView) => s.active },
  pausadas: { label: "Pausadas", test: (s: SourceView) => !s.active },
  descobertas: {
    label: "Descobertas automaticamente",
    test: (s: SourceView) => s.origin === "web_discovery",
  },
} as const;

type SourceFilter = keyof typeof SOURCE_FILTERS;
type SourceView = { isFavorite: boolean; active: boolean; origin: string };

const originOf = (url: string, host: string) => {
  try {
    return `${new URL(url).origin}/`;
  } catch {
    return `https://${host}/`;
  }
};

const hostOfUrl = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Link externo discreto (ex.: "Acessar fonte ↗"), sempre em nova aba e só http(s). */
function ExternalLink({ href, children }: { href: string | null; children: ReactNode }) {
  const safe = safeExternalUrl(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1 text-xs hover:border-brand hover:text-brand"
    >
      {children} <NavIcon name="external" className="h-3 w-3" />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}

/** Bloco recolhível de peso visual menor (histórico, páginas ignoradas, detalhes técnicos). */
function Collapsible({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-line bg-card/60 p-4 text-sm">
      <summary className="cursor-pointer select-none font-medium text-muted hover:text-brand">
        {title}
        {hint && <span className="ml-2 text-xs font-normal">· {hint}</span>}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { membership } = await requireMembership();
  const isAdmin = can(membership.role, "org.manage");
  const canSearch = can(membership.role, "editais.search");
  const supabase = await createClient();
  const { filtro } = await searchParams;
  const filter: SourceFilter =
    filtro && filtro in SOURCE_FILTERS ? (filtro as SourceFilter) : "todas";

  // Mês corrente no fuso de Brasília (mesma regra do contador no banco).
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const monthlyLimit = discoveryLimitsFromEnv().maxRequestsPerMonth;
  const [sources, runs, ignoredPages, discoveryRuns, uncertain, discovered, usage] =
    await Promise.all([
      supabase
        .from("edital_sources")
        // select("*"): a tela funciona antes e depois da migração do adaptador (etapa 6).
        .select("*")
        .eq("org_id", membership.orgId)
        .order("name"),
      supabase
        .from("monitor_runs")
        .select("*")
        .eq("org_id", membership.orgId)
        .order("started_at", { ascending: false })
        .limit(20),
      supabase
        .from("monitor_ignored_urls")
        .select("id, source_id, url, title, page_type, reasons, last_seen_at")
        .eq("org_id", membership.orgId)
        .order("last_seen_at", { ascending: false })
        .limit(30),
      // Descoberta web (ADR-0024): só administradores leem (RLS). Sem vitrine de descartados.
      isAdmin
        ? supabase
            .from("discovery_runs")
            .select("*")
            .eq("org_id", membership.orgId)
            .order("started_at", { ascending: false })
            .limit(5)
        : null,
      isAdmin
        ? supabase
            .from("discovery_candidates")
            .select(
              "id, url, title, institution, audiovisual_reasons, audiovisual_evidence, status_reason, last_seen_at",
            )
            .eq("org_id", membership.orgId)
            .eq("status", "uncertain")
            .order("last_seen_at", { ascending: false })
            .limit(10)
        : null,
      isAdmin
        ? supabase
            .from("discovery_candidates")
            .select("official_host, official_url, institution")
            .eq("org_id", membership.orgId)
            .eq("audiovisual", "yes")
            .in("status", ["imported", "duplicate"])
            .limit(200)
        : null,
      isAdmin
        ? supabase
            .from("search_api_usage")
            .select("requests")
            .eq("org_id", membership.orgId)
            .eq("month", month)
            .maybeSingle()
        : null,
    ]);
  const allSources = [...(sources.data ?? [])].sort(
    (a, b) =>
      Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite)) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
  const visibleSources = allSources.filter((source) =>
    SOURCE_FILTERS[filter].test({
      isFavorite: Boolean(source.is_favorite),
      active: source.active,
      origin: source.origin ?? "manual",
    }),
  );
  // Novas fontes: instituições com oportunidades audiovisuais confirmadas, ainda não cadastradas.
  const registeredHosts = new Set(allSources.map((source) => hostOfUrl(source.list_url)));
  const newSources = [
    ...(discovered?.data ?? [])
      .filter((row) => row.official_host && !registeredHosts.has(row.official_host))
      .reduce((map, row) => {
        const entry = map.get(row.official_host!) ?? {
          host: row.official_host!,
          institution: row.institution ?? row.official_host!,
          sampleUrl: row.official_url ?? `https://${row.official_host}/`,
          count: 0,
        };
        entry.count++;
        return map.set(row.official_host!, entry);
      }, new Map<string, { host: string; institution: string; sampleUrl: string; count: number }>())
      .values(),
  ].sort((a, b) => b.count - a.count);
  const sourceNames = new Map((sources.data ?? []).map((source) => [source.id, source.name]));
  // Checagem de duplicidade antes de oferecer o cadastro (www/barra final contam como iguais).
  const missingSuggestions = SUGGESTED_SOURCES.filter(
    (suggestion) => !findSameSource(allSources, suggestion.list_url),
  );
  const uncertainItems = uncertain?.error ? [] : (uncertain?.data ?? []);
  const discoveryRunRows = discoveryRuns?.error ? [] : (discoveryRuns?.data ?? []);

  return (
    <div className="space-y-6">
      <Link href="/editais" className="inline-block text-sm text-muted hover:text-brand">
        ← Voltar para editais
      </Link>
      <PageHeader
        title="Buscar Editais"
        description="Verifique as fontes cadastradas ou busque oportunidades audiovisuais na web. Editais novos entram como “revisão pendente” para triagem da equipe."
      />

      <DbErrorNotice error={sources.error} isAdmin={isAdmin} context="as fontes" />

      {canSearch ? (
        <SearchPanel />
      ) : (
        <Card>
          <p className="text-sm text-muted">
            As buscas são executadas por quem administra a plataforma. Os editais encontrados
            aparecem na lista de{" "}
            <Link href="/editais" className="text-brand hover:underline">
              Editais
            </Link>
            .
          </p>
        </Card>
      )}

      {isAdmin && uncertainItems.length > 0 && (
        <Card>
          <SectionTitle>Para confirmar ({uncertainItems.length})</SectionTitle>
          <p className="mb-3 text-xs text-muted">
            A busca na web encontrou estas páginas, mas não conseguiu confirmar se o objeto é
            audiovisual. Confirme para importar (entra como revisão pendente) ou descarte.
          </p>
          <ul className="space-y-4 text-sm">
            {uncertainItems.map((item) => (
              <li key={item.id} className="space-y-2">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium">{item.title ?? item.url}</p>
                  <p className="text-xs text-muted">
                    {item.institution && `${item.institution} · `}
                    {item.audiovisual_reasons[0] ?? item.status_reason}
                    {item.audiovisual_evidence && ` · “${item.audiovisual_evidence}”`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <ExternalLink href={item.url}>Acessar página</ExternalLink>
                  <form action={importDiscoveryCandidate.bind(null, item.id)}>
                    <button className="rounded-md border border-brand/60 px-3 py-1 text-brand hover:bg-brand/10">
                      É audiovisual: importar
                    </button>
                  </form>
                  <form action={dismissDiscoveryCandidate.bind(null, item.id)}>
                    <button className="rounded-md border border-line px-3 py-1 text-muted hover:border-bad hover:text-bad">
                      Descartar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="fontes-cadastradas" className="min-w-0 space-y-3 lg:col-span-2">
          <h2 id="fontes-cadastradas" className="text-lg font-semibold">
            Fontes cadastradas
            <span className="ml-2 text-sm font-normal text-muted">({allSources.length})</span>
          </h2>
          {!sources.error && allSources.length === 0 && (
            <EmptyState title="Nenhuma fonte cadastrada">
              {isAdmin
                ? "Cadastre uma fonte ou adicione as sugeridas."
                : "Peça a um administrador para cadastrar fontes."}
            </EmptyState>
          )}
          <nav aria-label="Filtrar fontes" className="flex flex-wrap gap-2 text-xs">
            {(Object.keys(SOURCE_FILTERS) as SourceFilter[]).map((key) => (
              <Link
                key={key}
                href={key === "todas" ? "/editais/fontes" : `/editais/fontes?filtro=${key}`}
                aria-current={filter === key ? "page" : undefined}
                className={`rounded-full border px-3 py-1 ${
                  filter === key
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-line text-muted hover:border-brand hover:text-brand"
                }`}
              >
                {SOURCE_FILTERS[key].label}
              </Link>
            ))}
          </nav>
          {!sources.error && allSources.length > 0 && visibleSources.length === 0 && (
            <p className="text-sm text-muted">Nenhuma fonte neste filtro.</p>
          )}
          {visibleSources.map((source) => {
            const status = source.last_status ? STATUS[source.last_status] : null;
            const { adapter, warning } = parseSourceAdapter(source.adapter_config);
            return (
              <article
                key={source.id}
                className={`min-w-0 rounded-xl border bg-card p-4 sm:p-5 ${
                  source.is_favorite ? "border-brand/60" : "border-line"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="flex items-center gap-2 font-semibold">
                      {isAdmin ? (
                        <form action={toggleFavorite.bind(null, source.id, !source.is_favorite)}>
                          <button
                            aria-label={
                              source.is_favorite ? "Desmarcar favorita" : "Marcar como favorita"
                            }
                            title={
                              source.is_favorite
                                ? "Favorita (clique para desmarcar)"
                                : "Marcar como favorita"
                            }
                            className={
                              source.is_favorite ? "text-brand" : "text-muted hover:text-brand"
                            }
                          >
                            {source.is_favorite ? "★" : "☆"}
                          </button>
                        </form>
                      ) : (
                        source.is_favorite && (
                          <span aria-label="Favorita" className="text-brand">
                            ★
                          </span>
                        )
                      )}
                      <span className="break-words">{source.name}</span>
                    </h3>
                    <p className="truncate text-xs text-muted">{source.list_url}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!source.active && <Badge>Pausada</Badge>}
                    {source.origin === "web_discovery" && (
                      <Badge tone="brand">Descoberta automaticamente</Badge>
                    )}
                    {status ? (
                      <Badge tone={status.tone}>{status.label}</Badge>
                    ) : (
                      <Badge>Ainda não verificada</Badge>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">
                  Última verificação: {dateTime(source.last_run_at)}
                  {source.last_imported !== null && ` · ${source.last_imported} novo(s)`}
                  {source.link_contains && ` · filtro: ${source.link_contains}`}
                  {source.audiovisual_only
                    ? " · fonte de audiovisual"
                    : " · fonte geral (filtra audiovisual)"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Até {adapter.maxImports} nova(s) por verificação
                  {adapter.classifyPages
                    ? " · classifica páginas"
                    : " · sem classificação de páginas"}
                  {adapter.linkExcludes.length + adapter.titleExcludes.length > 0 &&
                    ` · ${adapter.linkExcludes.length + adapter.titleExcludes.length} regra(s) de exclusão`}
                  {!adapter.allowPdfLinks && " · ignora links de PDF"}
                </p>
                {warning && <p className="mt-2 text-xs text-warn">{warning}</p>}
                {source.last_error && <p className="mt-2 text-sm text-bad">{source.last_error}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <ExternalLink href={source.list_url}>Acessar fonte</ExternalLink>
                  {isAdmin && (
                    <>
                      <form action={toggleSource.bind(null, source.id, !source.active)}>
                        <button className="rounded-md border border-line px-3 py-1 hover:border-brand hover:text-brand">
                          {source.active ? "Pausar" : "Reativar"}
                        </button>
                      </form>
                      <form action={deleteSource.bind(null, source.id)}>
                        <button className="rounded-md border border-line px-3 py-1 text-muted hover:border-bad hover:text-bad">
                          Remover
                        </button>
                      </form>
                      <TestSourceButton sourceId={source.id} />
                    </>
                  )}
                </div>
                {isAdmin && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted hover:text-brand">
                      Configurar fonte
                    </summary>
                    <SourceConfigForm
                      sourceId={source.id}
                      adapter={adapter}
                      linkContains={source.link_contains}
                      audiovisualOnly={source.audiovisual_only}
                    />
                  </details>
                )}
              </article>
            );
          })}
        </section>

        {isAdmin && (
          <div className="min-w-0 space-y-6">
            <Card>
              <SectionTitle>Nova fonte</SectionTitle>
              <SourceForm />
            </Card>
            <Card>
              <SectionTitle>Catálogo de fontes</SectionTitle>
              <p className="mb-3 text-xs text-muted">
                Fontes conhecidas de editais audiovisuais. Endereços já cadastrados não aparecem
                aqui; fontes novas entram pausadas até você testar e reativar.
              </p>
              {missingSuggestions.length > 0 && (
                <ul className="mb-4 space-y-3 text-sm">
                  {missingSuggestions.map((suggestion) => (
                    <li key={suggestion.list_url} className="space-y-2">
                      <p className="font-medium">{suggestion.name}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <ExternalLink href={suggestion.list_url}>Acessar fonte</ExternalLink>
                        <form action={addSuggestedSource.bind(null, suggestion.list_url)}>
                          <button className="rounded-md border border-brand/60 px-3 py-1 text-brand hover:bg-brand/10">
                            Cadastrar fonte
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {missingSuggestions.length > 1 && (
                <form action={addSuggestedSources} className="mb-4">
                  <button className="w-full rounded-md border border-line px-4 py-2 text-xs text-muted hover:border-brand hover:text-brand">
                    Cadastrar todas as sugeridas ({missingSuggestions.length})
                  </button>
                </form>
              )}
              {newSources.length > 0 && (
                <div className="mb-4 space-y-2">
                  <h3 className="text-sm font-medium">Encontradas pela busca na web</h3>
                  <p className="text-xs text-muted">
                    Instituições com oportunidades audiovisuais confirmadas e ainda não cadastradas.
                  </p>
                  {newSources.slice(0, 8).map((entry) => (
                    <details key={entry.host} className="rounded-md border border-line p-3 text-sm">
                      <summary className="cursor-pointer">
                        <span className="font-medium">{entry.institution}</span>{" "}
                        <span className="text-xs text-muted">
                          · {entry.host} · {entry.count} oportunidade(s)
                        </span>
                      </summary>
                      <div className="mt-2">
                        <ExternalLink href={originOf(entry.sampleUrl, entry.host)}>
                          Acessar fonte
                        </ExternalLink>
                      </div>
                      <DiscoveredSourceForm
                        name={entry.institution}
                        listUrl={originOf(entry.sampleUrl, entry.host)}
                      />
                    </details>
                  ))}
                </div>
              )}
              <h3 className="mb-2 text-sm font-medium">Modelos prontos</h3>
              <p className="mb-2 text-xs text-muted">
                Configuração pronta: cole a página oficial, teste e cadastre.
              </p>
              <div className="space-y-2">
                {SOURCE_CATALOG.map((entry) => (
                  <details key={entry.key} className="rounded-md border border-line p-3 text-sm">
                    <summary className="cursor-pointer">
                      <span className="font-medium">{entry.name}</span>{" "}
                      <span className="text-xs text-muted">
                        · {CATALOG_KIND_LABELS[entry.kind]}
                      </span>
                    </summary>
                    <p className="mt-2 text-xs text-muted">{entry.notes}</p>
                    <CatalogSourceForm entry={entry} />
                  </details>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {isAdmin && (
          <Collapsible
            title="Buscas na web anteriores"
            hint={`API de busca neste mês: ${usage?.error ? "—" : (usage?.data?.requests ?? 0)} de ${monthlyLimit}`}
          >
            <p className="mb-3 text-xs text-muted">
              Decide pelo objeto financiado (filme, série, documentário…), não pelo tema. O que não
              é audiovisual, está encerrado ou não é oportunidade não vira edital. Ao atingir o teto
              mensal de chamadas, a busca para.
            </p>
            {discoveryRunRows.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma busca na web executada ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="border-b border-line uppercase tracking-wider text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Quando</th>
                      <th className="py-2 pr-3 font-medium">Origem</th>
                      <th className="py-2 pr-3 font-medium">Resultado</th>
                      <th className="py-2 pr-3 text-right font-medium">Consultas</th>
                      <th className="py-2 pr-3 text-right font-medium">Chamadas à API</th>
                      <th className="py-2 pr-3 text-right font-medium">Analisadas</th>
                      <th className="py-2 pr-3 text-right font-medium">Audiovisuais</th>
                      <th className="py-2 pr-3 text-right font-medium">Novas</th>
                      <th className="py-2 text-right font-medium">Novas fontes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryRunRows.map((run) => (
                      <tr key={run.id} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap py-2 pr-3">{dateTime(run.started_at)}</td>
                        <td className="py-2 pr-3 text-muted">
                          {run.trigger === "cron" ? "Automática" : "Manual"}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge
                            tone={
                              run.status === "ok" ? "ok" : run.status === "partial" ? "warn" : "bad"
                            }
                          >
                            {DISCOVERY_STATUS[run.status] ?? run.status}
                          </Badge>
                          {run.error && <span className="ml-2 text-muted">{run.error}</span>}
                          {limitLabel(run.limit_reached) && (
                            <span className="ml-2 text-warn">{limitLabel(run.limit_reached)}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{run.queries_run}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {run.api_requests ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{run.analyzed}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{run.audiovisual_yes}</td>
                        <td className="py-2 pr-3 text-right font-medium tabular-nums text-brand">
                          {run.imported}
                        </td>
                        <td className="py-2 text-right tabular-nums">{run.new_sources}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Collapsible>
        )}

        <Collapsible
          title="Histórico de varreduras"
          hint={`${(runs.data ?? []).length} registro(s) recente(s)`}
        >
          {(runs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">Nenhuma varredura executada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Quando</th>
                    <th className="py-2 pr-4 font-medium">Fonte</th>
                    <th className="py-2 pr-4 font-medium">Origem</th>
                    <th className="py-2 pr-4 font-medium">Resultado</th>
                    <th className="py-2 pr-4 text-right font-medium">Encontradas</th>
                    <th className="py-2 pr-4 text-right font-medium">Novas</th>
                    <th className="py-2 pr-4 text-right font-medium">Duplicadas</th>
                    <th className="py-2 pr-4 text-right font-medium">Com restrição</th>
                    <th className="py-2 pr-4 text-right font-medium">Ignoradas</th>
                    <th className="py-2 text-right font-medium">Erros</th>
                  </tr>
                </thead>
                <tbody>
                  {(runs.data ?? []).map((run) => {
                    // Linhas antigas (antes do resumo detalhado) não têm estes contadores.
                    const detailed = Boolean(run.execution_id);
                    const count = (value: number | null | undefined) =>
                      detailed ? (value ?? 0) : "—";
                    return (
                      <tr key={run.id} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap py-2 pr-4">{dateTime(run.started_at)}</td>
                        <td className="py-2 pr-4">
                          {(run.source_id && sourceNames.get(run.source_id)) ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-muted">
                          {run.trigger === "cron" ? "Automática" : "Manual"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge tone={STATUS[run.status]?.tone ?? "neutral"}>
                            {STATUS[run.status]?.label ?? run.status}
                          </Badge>
                          {run.error && (
                            <span className="ml-2 text-xs text-muted">{run.error}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{count(run.found)}</td>
                        <td className="py-2 pr-4 text-right font-medium tabular-nums text-brand">
                          {run.imported}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {count(run.duplicates)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted">
                          {run.rejected ?? 0}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted">
                          {count(run.ignored_pages)}
                        </td>
                        <td className="py-2 text-right tabular-nums">{count(run.failed)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Collapsible>

        {!ignoredPages.error && (ignoredPages.data ?? []).length > 0 && (
          <Collapsible
            title="Páginas ignoradas"
            hint={`${(ignoredPages.data ?? []).length} página(s)`}
          >
            <p className="mb-4 text-xs text-muted">
              Lidas pela varredura e não transformadas em edital, com o motivo. Não são lidas de
              novo até um administrador pedir reavaliação.
            </p>
            <ul className="space-y-3 text-sm">
              {(ignoredPages.data ?? []).map((item) => (
                <li key={item.id} className="space-y-2">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words font-medium">{item.title ?? item.url}</p>
                    <p className="text-xs text-muted">
                      <Badge>
                        {PAGE_TYPE_LABELS[item.page_type as PageType] ?? item.page_type}
                      </Badge>{" "}
                      {item.reasons.join(" · ")} ·{" "}
                      {(item.source_id && sourceNames.get(item.source_id)) ?? "—"} ·{" "}
                      {dateTime(item.last_seen_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ExternalLink href={item.url}>Acessar página</ExternalLink>
                    {isAdmin && (
                      <form action={forgetIgnoredUrl.bind(null, item.id)}>
                        <button className="rounded-md border border-line px-3 py-1 text-xs hover:border-brand hover:text-brand">
                          Reavaliar
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
