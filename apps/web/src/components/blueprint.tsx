import type { ReactNode } from "react";
import type { BlueprintArea } from "@/lib/blueprints";
import { Badge } from "@/components/ui";

/** Aviso padrão das plantas: estrutura futura, nada é gravado. */
export function BlueprintNotice({ children }: { children?: ReactNode }) {
  return (
    <div
      role="note"
      className="rounded-xl border border-dashed border-brand/40 bg-brand/5 px-4 py-3 text-sm text-muted"
    >
      <span className="mr-2">
        <Badge tone="brand">Em desenvolvimento</Badge>
      </span>
      {children ??
        "Planta do módulo: mostra como ele vai funcionar. Ainda não grava nem exibe dados."}
    </div>
  );
}

/** Grade de áreas previstas, todas marcadas como "Em desenvolvimento". */
export function BlueprintAreaGrid({ areas }: { areas: BlueprintArea[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {areas.map((area) => (
        <li
          key={area.key}
          className="flex min-w-0 flex-col gap-2 rounded-xl border border-dashed border-line bg-card/60 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{area.label}</h3>
            <Badge>Em desenvolvimento</Badge>
          </div>
          <p className="text-sm text-muted">{area.description}</p>
        </li>
      ))}
    </ul>
  );
}

/** Etapas em sequência (horizontal no desktop, vertical no celular). */
export function BlueprintSteps({
  steps,
  highlight = [],
}: {
  steps: BlueprintArea[];
  /** Etapas destacadas (ex.: as que entram em Produções Atuais). */
  highlight?: readonly string[];
}) {
  return (
    <ol className="grid gap-2 md:grid-cols-5">
      {steps.map((step, index) => {
        const on = highlight.includes(step.key);
        return (
          <li
            key={step.key}
            className={`min-w-0 rounded-xl border p-3 ${
              on ? "border-brand/60 bg-brand/5" : "border-line bg-card"
            }`}
          >
            <p className="text-xs text-muted">Etapa {index + 1}</p>
            <p className={`font-medium ${on ? "text-brand" : ""}`}>{step.label}</p>
            <p className="mt-1 text-xs text-muted">{step.description}</p>
          </li>
        );
      })}
    </ol>
  );
}
