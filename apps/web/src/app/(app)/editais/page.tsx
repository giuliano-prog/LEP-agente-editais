import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@lep/core";
import {
  compareEditais,
  matchProjects,
  summarizeAdherence,
  toEdital,
  type Edital,
} from "@lep/funding";
import { AdherenceCell } from "@/components/adherence-badge";
import { DbErrorNotice } from "@/components/db-error-notice";
import { Deadline, EditalStatusBadge } from "@/components/edital-badges";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { loadProponent } from "@/lib/proponent";
import { formatBRL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editais" };

const FILTERS = {
  ativos: { label: "Em acompanhamento", test: (e: Edital) => e.reviewStatus !== "discarded" },
  varredura: {
    label: "Novos da varredura",
    test: (e: Edital) =>
      e.origin === "monitor" && e.reviewStatus !== "validated" && e.reviewStatus !== "discarded",
  },
  pendentes: {
    label: "Revisão pendente",
    test: (e: Edital) => e.reviewStatus !== "validated" && e.reviewStatus !== "discarded",
  },
  descartados: { label: "Descartados", test: (e: Edital) => e.reviewStatus === "discarded" },
} as const;

type FilterKey = keyof typeof FILTERS;

export default async function EditaisPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { membership } = await requireMembership();
  const { filtro } = await searchParams;
  const filter: FilterKey = filtro && filtro in FILTERS ? (filtro as FilterKey) : "ativos";
  const canEdit = can(membership.role, "content.edit");
  const isAdmin = can(membership.role, "org.manage");
  const supabase = await createClient();

  // select("*") e ordenação no app: a lista funciona mesmo que a tabela remota tenha
  // colunas a mais ou ainda não tenha as colunas mais novas. O RLS limita à organização.
  const [editaisQuery, projectsQuery, lastRunQuery, proponent] = await Promise.all([
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
  ]);

  if (editaisQuery.error)
    console.error("Erro ao listar editais:", editaisQuery.error.code, editaisQuery.error.message);
  const now = new Date();
  const all = (editaisQuery.data ?? [])
    .map((row) => toEdital(row))
    .sort((a, b) => compareEditais(a, b, now));
  const projects = projectsQuery.error ? null : (projectsQuery.data ?? []);
  const rows = all.filter(FILTERS[filter].test);
  const lastRun = lastRunQuery.data?.started_at;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editais"
        description={
          <>
            Oportunidades monitoradas e cadastradas. A aderência compara cada edital com os projetos
            LEP — é compatibilidade técnica, não previsão de aprovação.
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
            Fontes monitoradas
          </Link>
          {canEdit && (
            <Link
              href="/editais/novo"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong"
            >
              + Novo edital
            </Link>
          )}
        </div>
      </PageHeader>

      <DbErrorNotice error={editaisQuery.error} isAdmin={isAdmin} context="os editais" />

      {!editaisQuery.error && (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtros">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => {
            const count = all.filter(FILTERS[key].test).length;
            const active = key === filter;
            return (
              <Link
                key={key}
                href={key === "ativos" ? "/editais" : `/editais?filtro=${key}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3 py-1 transition ${
                  active
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-line text-muted hover:text-fg"
                }`}
              >
                {FILTERS[key].label} <span className="tabular-nums">({count})</span>
              </Link>
            );
          })}
        </nav>
      )}

      {editaisQuery.error ? null : rows.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "Nenhum edital cadastrado ainda" : "Nenhum edital neste filtro"}
        >
          {all.length === 0 &&
            (canEdit
              ? "Cadastre um edital (link ou PDF) ou configure as fontes monitoradas para a varredura diária."
              : "Peça a um editor para cadastrar os editais.")}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[860px] text-left text-sm">
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
                      {edital.origin === "monitor" && <Badge tone="brand">Varredura</Badge>}
                      {edital.reviewStatus === "discarded" ? (
                        <Badge>Descartado</Badge>
                      ) : (
                        edital.reviewStatus !== "validated" && (
                          <Badge tone="warn">Revisão pendente</Badge>
                        )
                      )}
                    </div>
                    {edital.reviewStatus === "discarded" && edital.triageReason && (
                      <p className="mt-1.5 text-xs text-muted">{edital.triageReason}</p>
                    )}
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
      )}
    </div>
  );
}
