import type { Metadata } from "next";
import Link from "next/link";
import { toEdital } from "@lep/funding";
import { Deadline, EditalStatusBadge } from "@/components/edital-badges";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { formatBRL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editais" };

export default async function EditaisPage() {
  const { membership } = await requireMembership();
  const supabase = await createClient();

  // select("*"): a tabela pode ter colunas extras criadas no Supabase remoto;
  // toEdital normaliza o que vier. O RLS garante que só editais da org retornam.
  const { data, error } = await supabase
    .from("editais")
    .select("*")
    .eq("org_id", membership.orgId)
    .order("deadline", { ascending: true, nullsFirst: false });

  if (error) console.error("Erro ao listar editais:", error.message);
  const editais = (data ?? []).map((row) => toEdital(row));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editais"
        description="Oportunidades de financiamento cadastradas. Abra um edital para ver os critérios e o Match com os projetos LEP."
      />

      {error ? (
        <p className="rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          Não foi possível carregar os editais. Verifique se as migrações foram aplicadas e se o
          schema core está exposto na API do Supabase.
        </p>
      ) : editais.length === 0 ? (
        <EmptyState title="Nenhum edital cadastrado ainda">
          O cadastro de editais pela plataforma (URL ou PDF) entra em uma próxima etapa.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Título</th>
                <th className="px-4 py-3 font-medium">Órgão</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Prazo</th>
                <th className="px-4 py-3 text-right font-medium">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {editais.map((edital) => (
                <tr
                  key={edital.id}
                  className="border-b border-line transition last:border-0 hover:bg-card-raised"
                >
                  <td className="px-4 py-3">
                    <Link href={`/editais/${edital.id}`} className="font-medium hover:text-brand">
                      {edital.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{edital.agency ?? "—"}</td>
                  <td className="px-4 py-3">
                    <EditalStatusBadge status={edital.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Deadline value={edital.deadline} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBRL(edital.totalAmount)}
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
