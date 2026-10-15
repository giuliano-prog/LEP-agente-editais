import { setFindingStatus } from "@/app/(app)/editais/[id]/trabalho/assistant-actions";
import { Badge, type BadgeTone } from "@/components/ui";
import { CONFIDENCE_LABELS, SOURCE_KIND_LABELS, type Confidence } from "@/lib/assistant/evidence";
import { FINDING_KIND_LABELS, type FindingRow, type Severity } from "@/lib/assistant/store";
import { S } from "./styles";

const SEVERITY: Record<Severity, { label: string; tone: BadgeTone }> = {
  high: { label: "Alta", tone: "bad" },
  medium: { label: "Média", tone: "warn" },
  low: { label: "Baixa", tone: "neutral" },
  info: { label: "Informativa", tone: "neutral" },
};

export const CONFIDENCE_TONES: Record<Confidence, BadgeTone> = {
  confirmed: "ok",
  inferred: "brand",
  not_found: "neutral",
  needs_human: "warn",
};

const when = (iso: string | undefined | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;

/**
 * Achados registrados pelo Assistente LEP (ou pela equipe), com a evidência que sustenta
 * cada conclusão (“Por que a IA concluiu isso?”) e a decisão da equipe (resolver/descartar).
 */
export function FindingList({
  findings,
  editalId,
  canEdit,
  anchor,
  empty,
}: {
  findings: FindingRow[];
  editalId: string;
  canEdit: boolean;
  anchor: string;
  empty?: string;
}) {
  if (findings.length === 0) return empty ? <p className="text-sm text-muted">{empty}</p> : null;
  return (
    <ul className="divide-y divide-line">
      {findings.map((finding) => {
        const closed = finding.status !== "open";
        const evidence = finding.evidence ?? {};
        return (
          <li
            key={finding.id}
            id={`achado-${finding.id}`}
            className="scroll-mt-24 space-y-1.5 py-3 text-sm"
          >
            <div className="flex flex-wrap items-start gap-2">
              <span className="flex flex-wrap gap-1.5">
                <Badge tone={SEVERITY[finding.severity].tone}>
                  {FINDING_KIND_LABELS[finding.kind]}
                </Badge>
                <Badge tone={CONFIDENCE_TONES[finding.confidence]}>
                  {CONFIDENCE_LABELS[finding.confidence]}
                </Badge>
                {finding.points !== null && <Badge tone="brand">{finding.points} pts</Badge>}
                {closed && (
                  <Badge>{finding.status === "resolved" ? "Resolvido" : "Descartado"}</Badge>
                )}
              </span>
              <span
                className={`min-w-0 flex-1 ${closed ? "text-muted line-through" : "font-medium"}`}
              >
                {finding.itemId ? (
                  <a href={`#item-${finding.itemId}`} className="hover:text-brand">
                    {finding.title}
                  </a>
                ) : (
                  finding.title
                )}
              </span>
            </div>
            {finding.detail && <p className="text-muted">{finding.detail}</p>}
            {finding.resolution && (
              <p className="text-xs text-muted">Decisão da equipe: {finding.resolution}</p>
            )}
            <details className="text-xs text-muted">
              <summary className="cursor-pointer hover:text-brand">
                {finding.createdVia === "assistant" ? "Por que a IA concluiu isso?" : "Evidência"}
              </summary>
              <div className="mt-1 space-y-1 border-l-2 border-brand/60 pl-3">
                <p>
                  {SOURCE_KIND_LABELS[finding.sourceKind]} · {CONFIDENCE_LABELS[finding.confidence]}
                  {evidence.documento && ` · ${evidence.documento}`}
                  {evidence.pagina ? `, p. ${evidence.pagina}` : ""}
                  {evidence.secao ? ` · ${evidence.secao}` : ""}
                  {evidence.analisado_em && ` · analisado em ${when(evidence.analisado_em)}`}
                </p>
                {evidence.trecho ? (
                  <blockquote className="italic">“{evidence.trecho}”</blockquote>
                ) : (
                  <p>
                    Sem trecho literal do documento — trate como{" "}
                    {finding.confidence === "needs_human" ? "ponto a confirmar" : "inferência"}.
                  </p>
                )}
                <p>
                  {finding.createdVia === "assistant"
                    ? "Registrado pelo Assistente LEP."
                    : "Registrado pela equipe."}
                </p>
              </div>
            </details>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-1.5">
                {closed ? (
                  <form action={setFindingStatus.bind(null, editalId, finding.id, "open")}>
                    <input type="hidden" name="anchor" value={anchor} />
                    <button className={S.small}>Reabrir</button>
                  </form>
                ) : (
                  <form
                    action={setFindingStatus.bind(null, editalId, finding.id, "resolved")}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <input type="hidden" name="anchor" value={anchor} />
                    <input
                      name="resolution"
                      maxLength={2000}
                      placeholder={
                        finding.kind === "pending_decision"
                          ? "Decisão tomada"
                          : "Como foi resolvido (opcional)"
                      }
                      aria-label="Registro da decisão"
                      className={`${S.control} w-56 py-1 text-xs`}
                    />
                    <button className={S.small.replace("border-line", "border-ok/40")}>
                      {finding.kind === "pending_decision" ? "Registrar decisão" : "Resolver"}
                    </button>
                    <button
                      formAction={setFindingStatus.bind(null, editalId, finding.id, "dismissed")}
                      className={S.danger}
                    >
                      Descartar
                    </button>
                  </form>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
