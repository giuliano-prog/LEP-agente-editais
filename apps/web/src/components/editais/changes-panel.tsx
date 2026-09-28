import type { FieldChange } from "@lep/funding";
import { PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES, labelOf } from "@lep/projects";
import { resolveEditalChange } from "@/app/(app)/editais/actions";
import { Badge, Card, SectionTitle, type BadgeTone } from "@/components/ui";
import { formatBRL, formatDate } from "@/lib/format";

export type EditalChange = {
  id: string;
  kind: "fields_changed" | "rectification";
  summary: string;
  changes: unknown;
  status: "pending" | "applied" | "dismissed";
  detected_at: string;
  resolved_at: string | null;
};

const STATUS: Record<EditalChange["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "Pendente de revisão", tone: "warn" },
  applied: { label: "Valores novos aplicados", tone: "ok" },
  dismissed: { label: "Ignorada", tone: "neutral" },
};

const VOCABULARY: Record<string, Record<string, string>> = {
  formats: PROJECT_FORMATS,
  genres: PROJECT_GENRES,
  stages: PROJECT_STAGES,
};

function show(field: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (field === "deadline" || field === "opensAt") return formatDate(String(value));
  if (field === "totalAmount" || field === "maxAmountPerProject") return formatBRL(Number(value));
  if (Array.isArray(value))
    return value.map((code) => labelOf(VOCABULARY[field] ?? {}, String(code))).join(", ");
  return String(value);
}

const dateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });

/** Alterações e retificações detectadas (etapa 10): antes → depois, com o trecho. */
export function ChangesPanel({ changes, canEdit }: { changes: EditalChange[]; canEdit: boolean }) {
  return (
    <Card>
      <SectionTitle>Alterações e retificações detectadas</SectionTitle>
      {changes.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhuma alteração detectada. A varredura verifica os editais abertos periodicamente;
          também é possível verificar agora (botão no topo).
        </p>
      ) : (
        <ol className="space-y-5">
          {changes.map((change) => {
            const items = (Array.isArray(change.changes) ? change.changes : []) as FieldChange[];
            return (
              <li key={change.id} className="space-y-2 border-l-2 border-line pl-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={STATUS[change.status].tone}>{STATUS[change.status].label}</Badge>
                  {change.kind === "rectification" && (
                    <Badge tone="brand">Retificação / errata</Badge>
                  )}
                  <span className="text-muted">detectada em {dateTime(change.detected_at)}</span>
                </div>
                <p className="text-sm">{change.summary}</p>
                {items.length > 0 && (
                  <ul className="space-y-2 text-sm">
                    {items.map((item) => (
                      <li key={item.field}>
                        <span className="text-muted">{item.label}:</span>{" "}
                        <span className="line-through decoration-bad/60">
                          {show(item.field, item.before)}
                        </span>{" "}
                        → <span className="font-medium">{show(item.field, item.after)}</span>
                        {item.snippet && (
                          <span className="mt-1 block border-l-2 border-brand/60 pl-3 text-xs italic text-muted">
                            “{item.snippet}” ({item.source === "pdf" ? "PDF" : "página"})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {change.kind === "rectification" && (
                  <p className="text-xs text-muted">
                    O documento da retificação está na aba Documentos.
                  </p>
                )}
                {canEdit && change.status === "pending" && (
                  <div className="flex flex-wrap gap-2">
                    {items.length > 0 && (
                      <form action={resolveEditalChange.bind(null, change.id, "applied")}>
                        <button className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-surface hover:bg-brand-strong">
                          Aplicar valores novos
                        </button>
                      </form>
                    )}
                    <form action={resolveEditalChange.bind(null, change.id, "dismissed")}>
                      <button className="rounded-md border border-line px-3 py-1 text-xs hover:border-brand hover:text-brand">
                        {items.length > 0 ? "Ignorar" : "Marcar como revisada"}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 text-xs text-muted">
        Nada é alterado sozinho: os valores novos só entram no edital quando alguém da equipe
        aplica. Mudanças só de layout da página não geram alerta.
      </p>
    </Card>
  );
}
