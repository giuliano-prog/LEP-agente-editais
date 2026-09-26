import Link from "next/link";
import {
  MATCH_DISCLAIMER,
  VERDICT_LABELS,
  type MatchItem,
  type MatchResult,
  type MatchVerdict,
} from "@lep/funding";
import { Badge, type BadgeTone, Card } from "@/components/ui";

const VERDICT_TONES: Record<MatchVerdict, BadgeTone> = {
  compatible: "ok",
  compatible_with_pending: "warn",
  incompatible: "bad",
};

const GROUPS = [
  {
    field: "met",
    icon: "✓",
    title: "Requisitos atendidos",
    tone: "text-ok",
    border: "border-ok/30",
  },
  {
    field: "attention",
    icon: "⚠",
    title: "Pontos de atenção / documentos pendentes",
    tone: "text-warn",
    border: "border-warn/30",
  },
  { field: "unmet", icon: "✕", title: "Não atendidos", tone: "text-bad", border: "border-bad/30" },
] as const;

function Group({
  icon,
  title,
  tone,
  border,
  items,
}: (typeof GROUPS)[number] & { items: MatchItem[] }) {
  return (
    <div className={`rounded-lg border ${border} bg-surface/60 p-4`}>
      <h4 className={`mb-3 text-sm font-semibold ${tone}`}>
        {icon} {title} <span className="font-normal text-muted">({items.length})</span>
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Nenhum item.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2">
              <span className={`${tone} shrink-0`} aria-hidden>
                {icon}
              </span>
              <span>
                <span className="font-medium">{item.criterion}:</span>{" "}
                <span className="text-muted">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Painel de Match explicável. Mostra, por projeto, o que atende, o que exige
 * atenção e o que não atende — sempre com o aviso de que não é previsão de aprovação.
 */
export function MatchPanel({ results }: { results: MatchResult[] }) {
  return (
    <Card className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">
          Match com Projetos <span className="text-brand">LEP</span>
        </h2>
        <p
          role="note"
          className="rounded-md border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-muted"
        >
          <span className="font-medium text-brand">Importante: </span>
          {MATCH_DISCLAIMER}
        </p>
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum projeto cadastrado.{" "}
          <Link href="/projetos" className="text-brand hover:underline">
            Cadastre projetos
          </Link>{" "}
          para ver a análise de compatibilidade.
        </p>
      ) : (
        <div className="space-y-3">
          {results.map((result, index) => (
            <details
              key={result.projectId}
              open={index === 0}
              className="group rounded-lg border border-line bg-card-raised/40"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 marker:hidden">
                <span className="flex items-center gap-2 font-medium">
                  <span className="text-muted transition group-open:rotate-90" aria-hidden>
                    ›
                  </span>
                  {result.projectTitle}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-ok">✓ {result.met.length}</span>
                  <span className="text-warn">⚠ {result.attention.length}</span>
                  <span className="text-bad">✕ {result.unmet.length}</span>
                  <Badge tone={VERDICT_TONES[result.verdict]}>
                    {VERDICT_LABELS[result.verdict]}
                  </Badge>
                </span>
              </summary>
              <div className="grid gap-3 border-t border-line p-4 lg:grid-cols-3">
                {GROUPS.map((group) => (
                  <Group key={group.field} {...group} items={result[group.field]} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
