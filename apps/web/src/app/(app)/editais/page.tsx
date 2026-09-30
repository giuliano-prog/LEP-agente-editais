import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@lep/core";
import {
  CLOSED_STATUSES,
  compareEditais,
  RESTRICTED_ELIGIBILITY,
  matchProjects,
  summarizeAdherence,
  toEdital,
  type Edital,
} from "@lep/funding";
import { AdherenceCell } from "@/components/adherence-badge";
import { DbErrorNotice } from "@/components/db-error-notice";
import { Deadline, EditalStatusBadge, EligibilityBadge } from "@/components/edital-badges";
import { EditalActions, EditalCard } from "@/components/editais/edital-card";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { loadProponent } from "@/lib/proponent";
import { formatBRL } from "@/lib/format";
import { isAutomaticOrigin } from "@/lib/editais/constants";
import { DEADLINE_SOON_DAYS, editalMetrics } from "@/lib/editais/metrics";
import { safeExternalUrl } from "@/lib/editais/links";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editais" };

const FILTERS = {
  ativos: { label: "Em acompanhamento", test: (e: Edital) => e.reviewStatus !== "discarded" },
  varredura: {
    label: "Novos (varredura e busca web)",
    test: (e: Edital) =>
      isAutomaticOrigin(e.origin) &&
      e.reviewStatus !== "validated" &&
      e.reviewStatus !== "discarded",
  },
  pendentes: {
    label: "Revisão pendente",
    test: (e: Edital) => e.reviewStatus !== "validated" && e.reviewStatus !== "discarded",
  },
  descartados: { label: "Descartados", test: (e: Edital) => e.reviewStatus === "discarded" },
} as const;

type FilterKey = keyof typeof FILTERS;

/** Eixo "elegibilidade" (independe da triagem e da situação). */
const ELIGIBILITY_FILTERS = {
  todas: { label: "Todas", test: () => true },
  elegiveis: { label: "Elegíveis", test: (e: Edital) => e.eligibilityStatus === "eligible" },
  "nao-confirmadas": {
    label: "Não confirmadas",
    test: (e: Edital) => e.eligibilityStatus === "not_confirmed",
  },
  revisar: {
    label: "Necessita revisão",
    test: (e: Edital) => e.eligibilityStatus === "needs_review",
  },
  restricao: {
    label: "Com restrição",
    test: (e: Edital) => RESTRICTED_ELIGIBILITY.has(e.eligibilityStatus),
  },
} as const;

/** Eixo "situação" do edital. */
const SITUATION_FILTERS = {
  todas: { label: "Todas", test: () => true },
  abertas: { label: "Abertas", test: (e: Edital) => e.status === "open" },
  "em-breve": { label: "Em breve", test: (e: Edital) => e.status === "upcoming" },
  encerradas: {
    label: "Encerradas",
    test: (e: Edital) => e.status !== null && CLOSED_STATUSES.has(e.status),
  },
  "sem-situacao": { label: "Não informada", test: (e: Edital) => !e.status },
} as const;

type EligibilityKey = keyof typeof ELIGIBILITY_FILTERS;
type SituationKey = keyof typeof SITUATION_FILTERS;

function pick<T extends string>(
  value: string | undefined,
  options: Record<T, unknown>,
  fallback: T,
): T {
  return value && value in options ? (value as T) : fallback;
}

export default async function EditaisPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; elegibilidade?: string; situacao?: string }>;
}) {
  const { membership } = await requireMembership();
  const params = await searchParams;
  const filter = pick<FilterKey>(params.filtro, FILTERS, "ativos");
  const eligibility = pick<EligibilityKey>(params.elegibilidade, ELIGIBILITY_FILTERS, "todas");
  const situation = pick<SituationKey>(params.situacao, SITUATION_FILTERS, "todas");
  const href = (next: {
    filtro?: FilterKey;
    elegibilidade?: EligibilityKey;
    situacao?: SituationKey;
  }) => {
    const query = new URLSearchParams();
    const values = { filtro: filter, elegibilidade: eligibility, situacao: situation, ...next };
    if (values.filtro !== "ativos") query.set("filtro", values.filtro);
    if (values.elegibilidade !== "todas") query.set("elegibilidade", values.elegibilidade);
    if (values.situacao !== "todas") query.set("situacao", values.situacao);
    const text = query.toString();
    return text ? `/editais?${text}` : "/editais";
  };
  const canEdit = can(membership.role, "content.edit");
  const isAdmin = can(membership.role, "org.manage");
  const supabase = await createClient();

  // select("*") e ordenação no app: a lista funciona mesmo que a tabela remota tenha
  // colunas a mais ou ainda não tenha as colunas mais novas. O RLS limita à organização.
  const [editaisQuery, projectsQuery, lastRunQuery, proponent, pendingChangesQuery] =
    await Promise.all([
      supabase.from("editais").select("*").eq("org_id", membership.orgId),
      supabase
        .from("projetos")
        .select("id, title, format, genre, stage, budget")
        .eq("org_id", membership.orgId),
      supabase
        .from("monitor_runs")
        .select("started_at")
        .eq("org_id", membership.orgId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadProponent(supabase, membership.orgId),
      supabase
        .from("edital_changes")
        .select("edital_id")
        .eq("org_id", membership.orgId)
        .eq("status", "pending"),
    ]);
  const withPendingChanges = new Set(
    (pendingChangesQuery.error ? [] : (pendingChangesQuery.data ?? [])).map((row) =>
      String(row.edital_id),
    ),
  );

  if (editaisQuery.error)
    console.error("Erro ao listar editais:", editaisQuery.error.code, editaisQuery.error.message);
  const now = new Date();
  const all = (editaisQuery.data ?? [])
    .map((row) => toEdital(row))
    .sort((a, b) => compareEditais(a, b, now));
  const projects = projectsQuery.error ? null : (projectsQuery.data ?? []);
  const byOtherAxes = all
    .filter(ELIGIBILITY_FILTERS[eligibility].test)
    .filter(SITUATION_FILTERS[situation].test);
  const rows = byOtherAxes.filter(FILTERS[filter].test);
  const pendingCount = all.filter(FILTERS.varredura.test).length;
  const discardedCount = all.filter(FILTERS.descartados.test).length;
  const lastRun = lastRunQuery.data?.started_at;
  const kpis = editalMetrics(all, now);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editais"
        description={
          <>
            Oportunidades para a LEP. A aderência compara cada edital com as produções — é
            compatibilidade técnica, não previsão de aprovação.
            {lastRun && (
              <span className="block text-xs">
                Última varredura automática:{" "}
                {new Date(lastRun).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            )}
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Link
            href="/editais/fontes"
            className="rounded-md border border-line px-4 py-2 text-sm hover:border-brand hover:text-brand"
          >
            Buscar Editais
          </Link>
          {canEdit && (
            <Link
              href="/editais/analisar"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong"
            >
              Analisar Edital
            </Link>
          )}
        </div>
      </PageHeader>

      <DbErrorNotice error={editaisQuery.error} isAdmin={isAdmin} context="os editais" />

      {!editaisQuery.error && (
        <section aria-label="Indicadores" className="grid grid-cols-3 gap-3">
          {[
            { label: "Editais Ativos", value: kpis.active, href: "/editais" },
            { label: "Para Revisar", value: kpis.toReview, href: href({ filtro: "varredura" }) },
            {
              label: "Próximos do Prazo",
              hint: `até ${DEADLINE_SOON_DAYS} dias`,
              value: kpis.deadlineSoon,
              href: href({ situacao: "abertas" }),
            },
          ].map((kpi) => (
            <Link
              key={kpi.label}
              href={kpi.href}
              className="min-w-0 rounded-xl border border-line bg-card p-4 transition hover:border-brand/60 sm:p-5"
            >
              <span className="block text-2xl font-semibold tabular-nums text-brand sm:text-3xl">
                {kpi.value}
              </span>
              <span className="mt-1 block text-xs text-muted sm:text-sm">
                {kpi.label}
                {kpi.hint && <span className="hidden sm:inline"> · {kpi.hint}</span>}
              </span>
            </Link>
          ))}
        </section>
      )}

      {/* Triagem, elegibilidade e situação continuam no motor e nos filtros por endereço;
          a tela mostra só a visão principal e um atalho discreto para os descartados. */}
      {!editaisQuery.error && (
        <nav aria-label="Visão" className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {filter !== "ativos" || eligibility !== "todas" || situation !== "todas" ? (
            <>
              <span>
                Mostrando: <span className="text-fg">{FILTERS[filter].label}</span>
                {eligibility !== "todas" && ` · ${ELIGIBILITY_FILTERS[eligibility].label}`}
                {situation !== "todas" && ` · ${SITUATION_FILTERS[situation].label}`} ({rows.length}
                )
              </span>
              <Link href="/editais" className="hover:text-brand">
                Ver todos em acompanhamento
              </Link>
            </>
          ) : (
            <>
              <span>
                {rows.length} edital(is) em acompanhamento
                {pendingCount > 0 && ` · ${pendingCount} novo(s) para revisar`}
              </span>
              {pendingCount > 0 && (
                <Link href={href({ filtro: "varredura" })} className="hover:text-brand">
                  Ver novos
                </Link>
              )}
              <Link href={href({ filtro: "descartados" })} className="hover:text-brand">
                Ver descartados ({discardedCount})
              </Link>
            </>
          )}
        </nav>
      )}

      {editaisQuery.error ? null : rows.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "Nenhum edital cadastrado ainda" : "Nenhum edital neste filtro"}
        >
          {all.length === 0 &&
            (canEdit
              ? "Analise um edital em PDF ou use Buscar Editais para encontrar oportunidades."
              : "Peça a um editor para cadastrar os editais.")}
        </EmptyState>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {rows.map((edital) => (
              <EditalCard
                key={edital.id}
                edital={{
                  ...edital,
                  officialUrl: safeExternalUrl(edital.officialUrl),
                  adherence: projects
                    ? summarizeAdherence(matchProjects(edital, projects, now, proponent))
                    : null,
                }}
                highlight={
                  edital.reviewStatus === "discarded"
                    ? { label: "Descartado", tone: "neutral" }
                    : edital.reviewStatus !== "validated"
                      ? { label: "Revisão pendente", tone: "brand" }
                      : undefined
                }
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-card md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Oportunidade</th>
                  <th className="px-4 py-3 font-medium">Instituição</th>
                  <th className="px-4 py-3 font-medium">Prazo</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Aderência (Match)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((edital) => (
                  <tr
                    key={edital.id}
                    className="border-b border-line align-top transition last:border-0 hover:bg-card-raised"
                  >
                    <td className="max-w-md px-4 py-3">
                      <Link href={`/editais/${edital.id}`} className="font-medium hover:text-brand">
                        {edital.title}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <EditalStatusBadge status={edital.status} />
                        {RESTRICTED_ELIGIBILITY.has(edital.eligibilityStatus) && (
                          <EligibilityBadge status={edital.eligibilityStatus} />
                        )}
                        {withPendingChanges.has(edital.id) && (
                          <Badge tone="warn">Alteração a revisar</Badge>
                        )}
                        {edital.possibleDuplicateOf && edital.reviewStatus !== "discarded" && (
                          <Badge tone="warn">Possível duplicado</Badge>
                        )}
                        {edital.reviewStatus === "discarded" ? (
                          <Badge>Descartado</Badge>
                        ) : (
                          edital.reviewStatus !== "validated" && (
                            <Badge tone="warn">Revisão pendente</Badge>
                          )
                        )}
                      </div>
                      {RESTRICTED_ELIGIBILITY.has(edital.eligibilityStatus) &&
                        edital.eligibilityReason && (
                          <p className="mt-1.5 text-xs text-muted">{edital.eligibilityReason}</p>
                        )}
                      {edital.reviewStatus === "discarded" && edital.triageReason && (
                        <p className="mt-1.5 text-xs text-muted">{edital.triageReason}</p>
                      )}
                      <div className="mt-2.5">
                        <EditalActions
                          id={edital.id}
                          officialUrl={safeExternalUrl(edital.officialUrl)}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{edital.agency ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Deadline value={edital.deadline} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatBRL(edital.totalAmount)}
                      {edital.maxAmountPerProject !== null && (
                        <span className="block text-xs text-muted">
                          até {formatBRL(edital.maxAmountPerProject)}/projeto
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AdherenceCell
                        adherence={
                          projects
                            ? summarizeAdherence(matchProjects(edital, projects, now, proponent))
                            : null
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
