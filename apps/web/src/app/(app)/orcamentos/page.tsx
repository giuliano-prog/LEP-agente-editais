import type { Metadata } from "next";
import Link from "next/link";
import { BlueprintAreaGrid, BlueprintNotice } from "@/components/blueprint";
import { PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { BUDGET_SECTIONS } from "@/lib/blueprints";

export const metadata: Metadata = { title: "Orçamentos" };

/** Planta de Orçamentos: conceito apenas — sem banco e sem cadastro. */
export default async function OrcamentosPage() {
  await requireMembership();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Orçamentos"
        description="Orçamento de cada produção, por etapa e rubrica."
      />
      <BlueprintNotice>
        Conceito do módulo. Ainda não há cadastro de orçamentos; o valor informado em{" "}
        <Link href="/projetos" className="text-brand hover:underline">
          Produções
        </Link>{" "}
        continua sendo usado no Match com os editais.
      </BlueprintNotice>

      <section aria-labelledby="regra" className="space-y-3">
        <h2 id="regra" className="text-lg font-semibold">
          Regra principal
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Todo orçamento pertence a uma Produção — não existe orçamento solto.</li>
          <li>
            Nesta tela ficarão os orçamentos de todas as produções; dentro da produção, a área
            Orçamento mostra só o dela.
          </li>
          <li>Versões do orçamento ficam no histórico da produção.</li>
        </ul>
      </section>

      <section aria-labelledby="blocos" className="space-y-3">
        <h2 id="blocos" className="text-lg font-semibold">
          Blocos previstos
        </h2>
        <BlueprintAreaGrid areas={BUDGET_SECTIONS} />
      </section>
    </div>
  );
}
