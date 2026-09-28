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
import { addSuggestedSources, deleteSource, forgetIgnoredUrl, toggleSource } from "./actions";
import {
  CatalogSourceForm,
  RunNowButton,
  SourceConfigForm,
  SourceForm,
  TestSourceButton,
} from "./source-forms";

export const metadata: Metadata = { title: "Fontes monitoradas" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ok: { label: "OK", tone: "ok" },
  error: { label: "Erro", tone: "bad" },
  blocked: { label: "Bloqueada pelo site", tone: "warn" },
};

const dateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

export default async function SourcesPage() {
  const { membership } = await requireMembership();
  const isAdmin = can(membership.role, "org.manage");
  const supabase = await createClient();

  const [sources, runs, ignoredPages] = await Promise.all([
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
  ]);
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {!sources.error && (sources.data ?? []).length === 0 && (
            <EmptyState title="Nenhuma fonte cadastrada">
              {isAdmin
                ? "Cadastre uma fonte ou adicione as sugeridas."
                : "Peça a um administrador para cadastrar fontes."}
            </EmptyState>
          )}
          {(sources.data ?? []).map((source) => {
            const status = source.last_status ? STATUS[source.last_status] : null;
            const { adapter, warning } = parseSourceAdapter(source.adapter_config);
            return (
              <article key={source.id} className="rounded-xl border border-line bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h2 className="font-semibold">{source.name}</h2>
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
