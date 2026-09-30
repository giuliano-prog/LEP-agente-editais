import type { Metadata } from "next";
import { LifecycleSteps, ProductionCard } from "@/components/productions/production-sheet";
import { PageHeader, SectionTitle } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { DEMO_CURRENT_PRODUCTIONS } from "@/lib/demo/productions";

export const metadata: Metadata = { title: "Produções Atuais" };

/**
 * Produções Atuais: produções em orçamento, aprovadas ou em produção. Mesma entidade
 * (e mesma ficha) de Produções Concluídas — só o estado muda.
 * V1: cards DEMONSTRATIVOS de `lib/demo/productions.ts` (marcados como "Exemplo"),
 * nunca gravados no banco nem somados à contagem da Home.
 */
export default async function ProducoesAtuaisPage() {
  await requireMembership();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Produções Atuais"
        description="Produções em orçamento, aprovadas ou em andamento."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {DEMO_CURRENT_PRODUCTIONS.map((production) => (
          <ProductionCard
            key={production.slug}
            href={`/producoes-atuais/${production.slug}`}
            title={production.title}
            stage={production.stage}
            isDemo
          />
        ))}
      </div>

      <section aria-labelledby="ciclo" className="space-y-3">
        <SectionTitle>
          <span id="ciclo">Ciclo de vida</span>
        </SectionTitle>
        <LifecycleSteps />
      </section>
    </div>
  );
}
