import Link from "next/link";
import {
  ADHERENCE_LABELS,
  MATCH_DISCLAIMER,
  VERDICT_LABELS,
  type MatchFactor,
  type MatchLevel,
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

const LEVEL_TONES: Record<MatchLevel, BadgeTone> = {
  high: "ok",
  medium: "warn",
  low: "bad",
  insufficient: "neutral",
};

const STATE_LABELS: Record<
  MatchFactor["state"],
  { label: string; tone: string; points: number | null }
> = {
  met: { label: "✓ Atende", tone: "text-ok", points: 1 },
  partial: { label: "⚠ Parcial", tone: "text-warn", points: 0.5 },
  unmet: { label: "✕ Não atende", tone: "text-bad", points: 0 },
  unknown: { label: "? Sem dado", tone: "text-muted", points: null },
};

/** Explicação da pontuação: cada fator, peso, situação e pontos. */
function FactorsTable({ result }: { result: MatchResult }) {
  return (
    <div className="space-y-2 border-t border-line p-4">
      <h4 className="text-sm font-semibold">Como a aderência foi calculada</h4>
      {result.blockers.length > 0 && (
        <ul className="space-y-1 text-sm text-bad">
          {result.blockers.map((blocker) => (
            <li key={blocker}>✕ Impedimento — {blocker}</li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Fator</th>
              <th className="py-1 pr-3 text-right font-medium">Peso</th>
              <th className="py-1 pr-3 font-medium">Situação</th>
              <th className="py-1 pr-3 text-right font-medium">Pontos</th>
              <th className="py-1 font-medium">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {result.factors.map((factor) => {
              const state = STATE_LABELS[factor.state];
              return (
                <tr key={factor.key} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3">{factor.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{factor.weight}</td>
                  <td className={`py-1.5 pr-3 whitespace-nowrap ${state.tone}`}>{state.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {state.points === null ? "—" : factor.weight * state.points}
                  </td>
                  <td className="py-1.5 text-muted">{factor.detail}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Pontuação = pontos ÷ pesos dos fatores com dado ({result.score ?? "—"}). Confiança ={" "}
        {Math.round(result.confidence * 100)}% do peso total avaliado. Fatores sem dado não contam
        contra o projeto; com menos de 40% de confiança o resultado é “dados insuficientes”.
        Impedimentos (elegibilidade, território, prazo encerrado) tornam a aderência baixa.
      </p>
    </div>
  );
}

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
                  <Badge tone={LEVEL_TONES[result.level]}>
                    Aderência {ADHERENCE_LABELS[result.level].toLowerCase()}
                    {result.blockers.length > 0
                      ? " · impedimento"
                      : result.score !== null &&
                        result.level !== "insufficient" &&
                        ` · ${result.score}`}
                  </Badge>
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
              <FactorsTable result={result} />
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}
