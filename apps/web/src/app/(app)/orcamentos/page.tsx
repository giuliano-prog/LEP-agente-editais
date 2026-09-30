import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { BUDGET_SECTIONS } from "@/lib/productions/model";

export const metadata: Metadata = { title: "Orçamentos" };

/**
 * Orçamentos das produções. Ainda não há tabela de orçamentos no banco: a tela mostra
 * 0 orçamentos ativos (sem dados inventados) e a estrutura usada por cada orçamento.
 */
export default async function OrcamentosPage() {
  await requireMembership();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Orçamentos"
        description="Orçamentos das produções da LEP. Cada orçamento pertence a uma produção."
      />

      <EmptyState title="Nenhum orçamento ativo">
        Os orçamentos aparecem aqui e na área Orçamento de cada produção em{" "}
        <Link href="/producoes-atuais" className="text-brand hover:underline">
          Produções Atuais
        </Link>
        .
      </EmptyState>

      <section aria-labelledby="estrutura" className="space-y-3">
        <SectionTitle>
          <span id="estrutura">Estrutura do orçamento</span>
        </SectionTitle>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {BUDGET_SECTIONS.map((section) => (
            <li key={section.key} className="rounded-xl border border-line bg-card p-4">
              <p className="font-medium">{section.label}</p>
              <p className="mt-1 text-sm text-muted">{section.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
