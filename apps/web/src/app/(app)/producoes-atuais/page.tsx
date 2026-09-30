import type { Metadata } from "next";
import Link from "next/link";
import { BlueprintNotice, BlueprintSteps } from "@/components/blueprint";
import { PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import {
  CURRENT_PRODUCTION_STATES,
  PRODUCTION_AREAS,
  PRODUCTION_LIFECYCLE,
} from "@/lib/blueprints";

export const metadata: Metadata = { title: "Produções Atuais" };

/** Quadros previstos para acompanhar cada produção em andamento. */
const TRACKING = ["Cronograma", "Equipe", "Orçamento", "Documentos e Arquivos"] as const;

/** Planta de Produções Atuais: visão operacional das produções em andamento (sem dados). */
export default async function ProducoesAtuaisPage() {
  await requireMembership();
  const tracked = PRODUCTION_AREAS.filter((area) =>
    (TRACKING as readonly string[]).includes(area.label),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Produções Atuais"
        description="Painel das produções em andamento — normalmente de 5 a 10 ao mesmo tempo."
      />
      <BlueprintNotice />

      <section aria-labelledby="como-funciona" className="space-y-3">
        <h2 id="como-funciona" className="text-lg font-semibold">
          Como vai funcionar
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            Mostra as{" "}
            <Link href="/projetos" className="text-brand hover:underline">
              Produções
            </Link>{" "}
            aprovadas ou em produção, lado a lado, para o acompanhamento do dia a dia.
          </li>
          <li>
            Não existe cadastro separado: é a mesma produção, filtrada pelo estado. Ao finalizar,
            ela muda de estado e sai deste painel — nada é copiado.
          </li>
          <li>Cada cartão resume o andamento e leva à ficha completa da produção.</li>
        </ul>
      </section>

      <section aria-labelledby="estados" className="space-y-3">
        <h2 id="estados" className="text-lg font-semibold">
          Estados que entram no painel
        </h2>
        <BlueprintSteps steps={PRODUCTION_LIFECYCLE} highlight={CURRENT_PRODUCTION_STATES} />
      </section>

      <section aria-labelledby="cartao" className="space-y-3">
        <h2 id="cartao" className="text-lg font-semibold">
          Cartão de cada produção (planta)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((slot) => (
            <div
              key={slot}
              aria-hidden="true"
              className="space-y-3 rounded-xl border border-dashed border-line bg-card/60 p-4"
            >
              <div className="h-4 w-2/3 rounded bg-card-raised" />
              <div className="h-3 w-1/3 rounded bg-card-raised" />
              <ul className="space-y-1.5 text-xs text-muted">
                {tracked.map((area) => (
                  <li key={area.key} className="flex items-center justify-between gap-2">
                    <span>{area.label}</span>
                    <span className="h-2 w-16 rounded bg-card-raised" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Espaços reservados: nenhuma produção é exibida até o módulo ser construído.
        </p>
      </section>
    </div>
  );
}
