import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@lep/core";
import { labelOf, PROJECT_FORMATS, PROJECT_GENRES } from "@lep/projects";
import { DbErrorNotice } from "@/components/db-error-notice";
import { ProductionCard } from "@/components/productions/production-sheet";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Produções Concluídas" };

/**
 * Produções Concluídas: histórico/biblioteca das produções da LEP.
 * Rota, tabela (core.projetos) e API continuam "projetos". Enquanto o banco não tem o
 * ciclo de vida, toda produção cadastrada aparece aqui como "Finalizada"; quando tiver,
 * esta lista filtra os estados Finalizada/Arquivada (mesma entidade de Produções Atuais).
 */
export default async function ProjetosPage() {
  const { membership } = await requireMembership();
  const canEdit = can(membership.role, "content.edit");
  const supabase = await createClient();

  const { data: projects, error } = await supabase
    .from("projetos")
    .select("id, title, format, genre, budget, synopsis, created_at")
    .eq("org_id", membership.orgId)
    .order("created_at", { ascending: false });

  if (error) console.error("Erro ao listar projetos:", error.message);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produções Concluídas"
        description="Histórico e biblioteca das produções da LEP. Também usadas no Match com os editais."
      >
        {canEdit && (
          <Link
            href="/projetos/nova"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong"
          >
            + Adicionar Produção Concluída
          </Link>
        )}
      </PageHeader>

      {error ? (
        <DbErrorNotice
          error={error}
          isAdmin={can(membership.role, "org.manage")}
          context="as produções"
        />
      ) : !projects || projects.length === 0 ? (
        <EmptyState title="Nenhuma produção concluída cadastrada">
          {canEdit
            ? "Use “Adicionar Produção Concluída” para registrar a primeira."
            : "As produções cadastradas pela Diretoria aparecem aqui."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProductionCard
              key={project.id}
              href={`/projetos/${project.id}`}
              title={project.title}
              stage="finished"
            >
              <span className="text-sm text-muted">
                {labelOf(PROJECT_FORMATS, project.format)} ·{" "}
                {labelOf(PROJECT_GENRES, project.genre)}
                {project.budget !== null && ` · ${formatBRL(project.budget)}`}
              </span>
              {project.synopsis && (
                <span className="line-clamp-2 text-sm text-muted">{project.synopsis}</span>
              )}
            </ProductionCard>
          ))}
        </div>
      )}
    </div>
  );
}
