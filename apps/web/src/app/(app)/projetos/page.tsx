import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@lep/core";
import { labelOf, PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { BlueprintAreaGrid, BlueprintSteps } from "@/components/blueprint";
import { DbErrorNotice } from "@/components/db-error-notice";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { PRODUCTION_AREAS, PRODUCTION_LIFECYCLE } from "@/lib/blueprints";
import { formatBRL, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "./project-form";

export const metadata: Metadata = { title: "Produções" };

// "Produções" é o nome na interface; rota, tabela (core.projetos) e API continuam "projetos".
export default async function ProjetosPage() {
  const { membership } = await requireMembership();
  const canEdit = can(membership.role, "content.edit");
  const supabase = await createClient();

  const { data: projects, error } = await supabase
    .from("projetos")
    .select("id, title, format, genre, stage, budget, synopsis, created_at")
    .eq("org_id", membership.orgId)
    .order("created_at", { ascending: false });

  if (error) console.error("Erro ao listar projetos:", error.message);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Produções"
        description="Produções da LEP, usadas no Match com os editais. Dados sigilosos: visíveis somente para a equipe da LEP."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-3 lg:col-span-3">
          {error ? (
            <DbErrorNotice
              error={error}
              isAdmin={can(membership.role, "org.manage")}
              context="as produções"
            />
          ) : !projects || projects.length === 0 ? (
            <EmptyState title="Nenhuma produção cadastrada">
              {canEdit
                ? "Use o formulário para cadastrar a primeira produção."
                : "Peça à Diretoria ou a um ADM para cadastrar produções."}
            </EmptyState>
          ) : (
            projects.map((project) => (
              <article
                key={project.id}
                className="rounded-xl border border-line bg-card p-4 transition hover:border-brand/40 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="break-words text-lg font-semibold">{project.title}</h2>
                  <span
                    className={`font-medium tabular-nums ${project.budget === null ? "text-sm text-muted" : "text-brand"}`}
                  >
                    {project.budget === null
                      ? "Orçamento não informado"
                      : formatBRL(project.budget)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="brand">{labelOf(PROJECT_FORMATS, project.format)}</Badge>
                  <Badge>{labelOf(PROJECT_GENRES, project.genre)}</Badge>
                  <Badge>{labelOf(PROJECT_STAGES, project.stage)}</Badge>
                </div>
                {project.synopsis && (
                  <p className="mt-3 line-clamp-3 text-sm text-muted">{project.synopsis}</p>
                )}
                <p className="mt-3 text-xs text-muted/70">
                  Cadastrada em {formatDate(project.created_at)}
                </p>
              </article>
            ))
          )}
        </div>

        <div className="min-w-0 lg:col-span-2">
          {canEdit ? (
            <Card className="lg:sticky lg:top-24">
              <SectionTitle>Cadastrar Produção</SectionTitle>
              <ProjectForm />
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-muted">
                Seu perfil permite consultar as produções. Para cadastrar, é necessário o perfil
                Diretoria ou ADM.
              </p>
            </Card>
          )}
        </div>
      </div>

      <section aria-labelledby="planta-producao" className="space-y-4">
        <div className="space-y-1">
          <h2 id="planta-producao" className="text-lg font-semibold">
            Estrutura de uma Produção
          </h2>
          <p className="text-sm text-muted">
            Planta do módulo: cada produção terá estas áreas. Ainda não gravam nem exibem dados.
          </p>
        </div>
        <BlueprintAreaGrid areas={PRODUCTION_AREAS} />
      </section>

      <section aria-labelledby="ciclo-producao" className="space-y-4">
        <div className="space-y-1">
          <h2 id="ciclo-producao" className="text-lg font-semibold">
            Ciclo de vida
          </h2>
          <p className="text-sm text-muted">
            A produção muda de estado — não é copiada. Aprovadas e em produção aparecem em{" "}
            <Link href="/producoes-atuais" className="text-brand hover:underline">
              Produções Atuais
            </Link>
            ; o{" "}
            <Link href="/orcamentos" className="text-brand hover:underline">
              Orçamento
            </Link>{" "}
            pertence sempre a uma produção.
          </p>
        </div>
        <BlueprintSteps steps={PRODUCTION_LIFECYCLE} />
      </section>
    </div>
  );
}
