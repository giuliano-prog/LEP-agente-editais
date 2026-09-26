import type { Metadata } from "next";
import { can } from "@lep/core";
import { labelOf, PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "./project-form";

export const metadata: Metadata = { title: "Projetos" };

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
    <div className="space-y-6">
      <PageHeader
        title="Projetos LEP"
        description="Projetos usados no Match com os editais. Dados sigilosos: visíveis somente para a equipe da LEP."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          {error ? (
            <p className="rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
              Não foi possível carregar os projetos. Verifique se as migrações foram aplicadas.
            </p>
          ) : !projects || projects.length === 0 ? (
            <EmptyState title="Nenhum projeto cadastrado">
              {canEdit
                ? "Use o formulário para cadastrar o primeiro projeto."
                : "Peça a um editor para cadastrar projetos."}
            </EmptyState>
          ) : (
            projects.map((project) => (
              <article
                key={project.id}
                className="rounded-xl border border-line bg-card p-5 transition hover:border-brand/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold">{project.title}</h2>
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
                  Cadastrado em {formatDate(project.created_at)}
                </p>
              </article>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {canEdit ? (
            <Card className="lg:sticky lg:top-24">
              <SectionTitle>Novo projeto</SectionTitle>
              <ProjectForm />
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-muted">
                Seu papel (Visualização) permite consultar os projetos. Para cadastrar, é necessário
                ser Editor/Revisor.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
