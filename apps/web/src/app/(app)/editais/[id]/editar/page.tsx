import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { toEdital } from "@lep/funding";
import { EditalForm } from "@/components/editais/edital-form";
import { PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { toBrasiliaInputs, toMoneyInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { updateEdital } from "../../actions";

export const metadata: Metadata = { title: "Editar edital" };

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export default async function EditEditalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string }>;
}) {
  const { id } = await params;
  if (!ID_PATTERN.test(id)) notFound();
  const { membership } = await requireMembership("editor");
  const { novo } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from("editais")
    .select("*")
    .eq("id", id)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!data) notFound();

  const edital = toEdital(data);
  const deadline = toBrasiliaInputs(edital.deadline);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={`/editais/${edital.id}`}
        className="inline-block text-sm text-muted hover:text-brand"
      >
        ← Voltar para o edital
      </Link>
      <PageHeader title="Editar edital" description={edital.title} />

      {novo && (
        <p className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          Edital criado com revisão pendente. Abra o documento guardado (na página do edital) e
          preencha os campos com base na fonte oficial.
        </p>
      )}

      <EditalForm
        action={updateEdital.bind(null, edital.id)}
        defaults={{
          title: edital.title,
          agency: edital.agency ?? "",
          status: edital.status ?? "",
          deadlineDate: deadline.date,
          deadlineTime: deadline.time,
          totalAmount: toMoneyInput(edital.totalAmount),
          maxAmountPerProject: toMoneyInput(edital.maxAmountPerProject),
          minBudget: toMoneyInput(edital.minBudget),
          maxBudget: toMoneyInput(edital.maxBudget),
          summary: edital.summary ?? "",
          eligibilityCriteria: edital.eligibilityCriteria.join("\n"),
          categories: edital.categories.join("\n"),
          requiredDocuments: edital.requiredDocuments.join("\n"),
          officialUrl: edital.officialUrl ?? "",
          acceptedFormats: edital.acceptedFormats,
          acceptedGenres: edital.acceptedGenres,
          acceptedStages: edital.acceptedStages,
          eligibleTerritories: edital.eligibleTerritories,
          reviewed: edital.reviewStatus === "validated",
        }}
      />
    </div>
  );
}
