import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@lep/core";
import { labelOf, PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { DbErrorNotice } from "@/components/db-error-notice";
import { ProductionSheet } from "@/components/productions/production-sheet";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL, formatDate } from "@/lib/format";
import { mediaForProduction } from "@/lib/productions/media";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Produção" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ficha de uma produção cadastrada (core.projetos) — mesma ficha de Produções Atuais. */
export default async function ProductionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ area?: string }>;
}) {
  const { membership } = await requireMembership();
  const [{ id }, { area }] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("projetos")
    .select("id, title, format, genre, stage, budget, synopsis, created_at")
    .eq("org_id", membership.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return (
      <DbErrorNotice
        error={error}
        isAdmin={can(membership.role, "org.manage")}
        context="a produção"
      />
    );
  }
  if (!project) notFound();

  return (
    <ProductionSheet
      title={project.title}
      stage="finished"
      basePath={`/projetos/${project.id}`}
      area={area}
      back={{ href: "/projetos", label: "Produções Concluídas" }}
      synopsis={project.synopsis}
      media={mediaForProduction(project.title)}
      budget={project.budget !== null ? formatBRL(project.budget) : null}
      facts={[
        { label: "Formato", value: labelOf(PROJECT_FORMATS, project.format) },
        { label: "Gênero / tipologia", value: labelOf(PROJECT_GENRES, project.genre) },
        { label: "Estágio (Match)", value: labelOf(PROJECT_STAGES, project.stage) },
        {
          label: "Orçamento total",
          value: project.budget !== null ? formatBRL(project.budget) : "Não informado",
        },
        { label: "Cadastrada em", value: formatDate(project.created_at) },
      ]}
    />
  );
}
