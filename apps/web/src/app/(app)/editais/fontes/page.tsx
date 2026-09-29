import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@lep/core";
import { PAGE_TYPE_LABELS, parseSourceAdapter, type PageType } from "@lep/funding";
import { DbErrorNotice } from "@/components/db-error-notice";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, type BadgeTone } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { CATALOG_KIND_LABELS, SOURCE_CATALOG } from "@/lib/monitor/catalog";
import { SUGGESTED_SOURCES } from "@/lib/monitor/suggested";
import { createClient } from "@/lib/supabase/server";
import {
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
  DiscoveryButton,
  RunNowButton,
  SourceConfigForm,
  SourceForm,
  TestSourceButton,
} from "./source-forms";

export const metadata: Metadata = { title: "Fontes monitoradas" };

// "Verificar agora" e "Buscar novas oportunidades" rodam nesta página (Server Actions):
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

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { membership } = await requireMembership();
  const isAdmin = can(membership.role, "org.manage");
  const supabase = await createClient();
  const { filtro } = await searchParams;
  const filter: SourceFilter =
    filtro && filtro in SOURCE_FILTERS ? (filtro as SourceFilter) : "todas";

  const [sources, runs, ignoredPages, discoveryRuns, uncertain, discovered] = await Promise.all([
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
  const missingSuggestions = SUGGESTED_SOURCES.filter(
    (suggestion) => !(sources.data ?? []).some((source) => source.list_url === suggestion.list_url),
  );

  return (
    <div className="space-y-6">
      <Link href="/editais" className="inline-block text-sm text-muted hover:text-brand">
        ← Voltar para editais
      </Link>
      <PageHeader
        title="Fontes monitoradas"
        description="Sites de editais verificados todo dia às 7h (Brasília). Editais novos entram como “revisão pendente” para triagem da equipe."
      />

      <DbErrorNotice error={sources.error} isAdmin={isAdmin} context="as fontes" />

      {isAdmin && <RunNowButton />}

      {isAdmin && (
        <Card>
          <SectionTitle>Descoberta web</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Procura oportunidades audiovisuais na web, inclusive em instituições ainda não
            cadastradas. Decide pelo objeto financiado (filme, série, documentário…), não pelo tema.
            O que não é audiovisual, está encerrado ou não é oportunidade não vira edital. Favoritas
            ⭐ têm prioridade, mas não limitam a busca.
          </p>
          <DiscoveryButton />
          {!discoveryRuns?.error && (discoveryRuns?.data ?? []).length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-line uppercase tracking-wider text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Quando</th>
                    <th className="py-2 pr-3 font-medium">Origem</th>
                    <th className="py-2 pr-3 font-medium">Resultado</th>
                    <th className="py-2 pr-3 text-right font-medium">Consultas</th>
                    <th className="py-2 pr-3 text-right font-medium">Analisadas</th>
                    <th className="py-2 pr-3 text-right font-medium">Audiovisuais</th>
                    <th className="py-2 pr-3 text-right font-medium">Novas</th>
                    <th className="py-2 text-right font-medium">Novas fontes</th>
                  </tr>
                </thead>
                <tbody>
                  {(discoveryRuns?.data ?? []).map((run) => (
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
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{run.queries_run}</td>
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
          {!uncertain?.error && (uncertain?.data ?? []).length > 0 && (
            <div className="mt-5 space-y-3">
              <h3 className="text-sm font-medium">
                Para confirmar ({(uncertain?.data ?? []).length})
              </h3>
              <p className="text-xs text-muted">
                A busca encontrou estas páginas, mas não conseguiu confirmar se o objeto é
                audiovisual. Confirme para importar (entra como revisão pendente) ou descarte.
              </p>
              <ul className="space-y-3 text-sm">
                {(uncertain?.data ?? []).map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-medium hover:text-brand"
                      >
                        {item.title ?? item.url} ↗
                      </a>
                      <p className="text-xs text-muted">
                        {item.institution && `${item.institution} · `}
                        {item.audiovisual_reasons[0] ?? item.status_reason}
                        {item.audiovisual_evidence && ` · “${item.audiovisual_evidence}”`}
                      </p>
                    </div>
                    <div className="flex gap-2 text-xs">
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
            </div>
          )}
          {newSources.length > 0 && (
            <div className="mt-5 space-y-2">
              <h3 className="text-sm font-medium">Novas fontes potencialmente relevantes</h3>
              <p className="text-xs text-muted">
                Instituições com oportunidades audiovisuais confirmadas e ainda não monitoradas.
                Entram pausadas: confira a página de listagem, teste e ative.
              </p>
              {newSources.slice(0, 8).map((entry) => (
                <details key={entry.host} className="rounded-md border border-line p-3 text-sm">
                  <summary className="cursor-pointer">
                    <span className="font-medium">{entry.institution}</span>{" "}
                    <span className="text-xs text-muted">
                      · {entry.host} · {entry.count} oportunidade(s) audiovisual(is)
                    </span>
                  </summary>
                  <DiscoveredSourceForm
                    name={entry.institution}
                    listUrl={originOf(entry.sampleUrl, entry.host)}
                  />
                </details>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
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
                className={`rounded-xl border bg-card p-5 ${
                  source.is_favorite ? "border-brand/60" : "border-line"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h2 className="flex items-center gap-2 font-semibold">
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
                      {source.name}
                    </h2>
                    <a
                      href={source.list_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-xs text-brand hover:underline"
                    >
                      {source.list_url} ↗
                    </a>
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
                {isAdmin && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
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
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {isAdmin && (
          <div className="space-y-6">
            {missingSuggestions.length > 0 && (
              <Card>
                <SectionTitle>Fontes sugeridas</SectionTitle>
                <ul className="mb-4 space-y-1 text-sm text-muted">
                  {missingSuggestions.map((source) => (
                    <li key={source.list_url}>• {source.name}</li>
                  ))}
                </ul>
                <form action={addSuggestedSources}>
                  <button className="w-full rounded-md border border-brand/60 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10">
                    Adicionar sugeridas
                  </button>
                </form>
                <p className="mt-2 text-xs text-muted">
                  Confira os endereços após a primeira verificação.
                </p>
              </Card>
            )}
            <Card>
              <SectionTitle>Catálogo de novas fontes</SectionTitle>
              <p className="mb-3 text-xs text-muted">
                Configuração pronta (sem seletores frágeis). Cole a página oficial, clique em
                “Testar” e adicione: a fonte entra pausada até você reativá-la.
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
            <Card>
              <SectionTitle>Nova fonte</SectionTitle>
              <SourceForm />
            </Card>
          </div>
        )}
      </div>

      <Card>
        <SectionTitle>Histórico de varreduras</SectionTitle>
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
                        {run.error && <span className="ml-2 text-xs text-muted">{run.error}</span>}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{count(run.found)}</td>
                      <td className="py-2 pr-4 text-right font-medium tabular-nums text-brand">
                        {run.imported}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{count(run.duplicates)}</td>
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
      </Card>
      {!ignoredPages.error && (ignoredPages.data ?? []).length > 0 && (
        <Card>
          <SectionTitle>Páginas ignoradas pela varredura</SectionTitle>
          <p className="mb-4 text-sm text-muted">
            Lidas e não transformadas em edital, com o motivo. Não são lidas de novo até um
            administrador pedir reavaliação.
          </p>
          <ul className="space-y-3 text-sm">
            {(ignoredPages.data ?? []).map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:text-brand"
                  >
                    {item.title ?? item.url} ↗
                  </a>
                  <p className="text-xs text-muted">
                    <Badge>{PAGE_TYPE_LABELS[item.page_type as PageType] ?? item.page_type}</Badge>{" "}
                    {item.reasons.join(" · ")} ·{" "}
                    {(item.source_id && sourceNames.get(item.source_id)) ?? "—"} ·{" "}
                    {dateTime(item.last_seen_at)}
                  </p>
                </div>
                {isAdmin && (
                  <form action={forgetIgnoredUrl.bind(null, item.id)}>
                    <button className="rounded-md border border-line px-3 py-1 text-xs hover:border-brand hover:text-brand">
                      Reavaliar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
