import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { matchProjects, toEdital, type Edital } from "@lep/funding";
import { labelOf, PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { Deadline, EditalStatusBadge, ReviewBadge } from "@/components/edital-badges";
import { MatchPanel } from "@/components/match-panel";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edital" };

// Aceita UUID ou id numérico (a tabela remota pode usar qualquer um dos dois).
const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export default async function EditalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();

  const { membership } = await requireMembership();
  const supabase = await createClient();

  const [editalQuery, projectsQuery] = await Promise.all([
    supabase.from("editais").select("*").eq("id", id).eq("org_id", membership.orgId).maybeSingle(),
    supabase
      .from("projetos")
      .select("id, title, format, genre, stage, budget")
      .eq("org_id", membership.orgId)
      .order("created_at", { ascending: false }),
  ]);

  if (editalQuery.error) console.error("Erro ao carregar edital:", editalQuery.error.message);
  if (!editalQuery.data) notFound();

  const edital = toEdital(editalQuery.data);
  const matches = matchProjects(edital, projectsQuery.data ?? []);

  return (
    <div className="space-y-6">
      <Link href="/editais" className="inline-block text-sm text-muted hover:text-brand">
        ← Voltar para editais
      </Link>

      <header className="space-y-3 pt-1">
        <div className="flex flex-wrap gap-2">
          <EditalStatusBadge status={edital.status} />
          <ReviewBadge reviewStatus={edital.reviewStatus} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{edital.title}</h1>
        {edital.agency && <p className="text-muted">{edital.agency}</p>}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Prazo final">
          <Deadline value={edital.deadline} />
        </Fact>
        <Fact label="Valor total">{formatBRL(edital.totalAmount)}</Fact>
        <Fact label="Valor máximo por projeto">{formatBRL(edital.maxAmountPerProject)}</Fact>
        <Fact label="Faixa de orçamento do projeto">{budgetRange(edital)}</Fact>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <SectionTitle>Resumo</SectionTitle>
            <p className="whitespace-pre-line leading-relaxed">
              {edital.summary ?? "Resumo ainda não cadastrado."}
            </p>
          </Card>

          <Card>
            <SectionTitle>Critérios de elegibilidade</SectionTitle>
            <BulletList
              items={edital.eligibilityCriteria}
              empty="Nenhum critério cadastrado. Consulte o documento oficial."
            />
          </Card>

          <Card>
            <SectionTitle>Documentos exigidos</SectionTitle>
            <BulletList items={edital.requiredDocuments} empty="Nenhum documento cadastrado." />
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <SectionTitle>Categorias</SectionTitle>
            {edital.categories.length === 0 ? (
              <p className="text-sm text-muted">Não informadas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {edital.categories.map((category) => (
                  <Badge key={category} tone="brand">
                    {category}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Regras usadas no Match</SectionTitle>
            <dl className="space-y-3 text-sm">
              <Rule
                label="Formatos"
                values={edital.acceptedFormats.map((code) => labelOf(PROJECT_FORMATS, code))}
              />
              <Rule
                label="Gêneros"
                values={edital.acceptedGenres.map((code) => labelOf(PROJECT_GENRES, code))}
              />
              <Rule
                label="Estágios"
                values={edital.acceptedStages.map((code) => labelOf(PROJECT_STAGES, code))}
              />
            </dl>
          </Card>

          <Card>
            <SectionTitle>Links oficiais</SectionTitle>
            <OfficialLinks edital={edital} />
          </Card>
        </aside>
      </div>

      <MatchPanel results={matches} />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-medium tabular-nums">{children}</p>
    </div>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span className="text-brand" aria-hidden>
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Rule({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>
        {values.length > 0 ? (
          values.join(", ")
        ) : (
          <span className="text-muted/70">Não registrado</span>
        )}
      </dd>
    </div>
  );
}

function OfficialLinks({ edital }: { edital: Edital }) {
  const links = [
    ...(edital.officialUrl ? [{ label: "Página oficial", url: edital.officialUrl }] : []),
    ...edital.officialLinks.filter((link) => link.url !== edital.officialUrl),
  ];
  if (links.length === 0) return <p className="text-sm text-muted">Nenhum link cadastrado.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {links.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-brand hover:underline"
          >
            {link.label} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}

function budgetRange(edital: Edital): string {
  const { minBudget, maxBudget } = edital;
  if (minBudget === null && maxBudget === null) return "—";
  if (minBudget !== null && maxBudget !== null)
    return `${formatBRL(minBudget)} a ${formatBRL(maxBudget)}`;
  return minBudget !== null ? `a partir de ${formatBRL(minBudget)}` : `até ${formatBRL(maxBudget)}`;
}
