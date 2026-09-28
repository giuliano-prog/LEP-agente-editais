import { EDITAL_STATUS_LABELS, ELIGIBILITY_LABELS } from "@lep/funding";
import { Card, SectionTitle } from "@/components/ui";

export type AuditEntry = {
  id: number;
  action: "insert" | "update" | "delete";
  actor_id: string | null;
  actor_name?: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

/** Nomes dos campos em pt-BR (colunas não listadas aparecem pelo nome técnico). */
const FIELD_LABELS: Record<string, string> = {
  title: "Título",
  agency: "Instituição",
  status: "Situação",
  deadline: "Prazo",
  total_amount: "Valor total",
  max_amount_per_project: "Valor por projeto",
  summary: "Resumo",
  review_status: "Triagem",
  triage_reason: "Motivo da triagem",
  eligibility_status: "Elegibilidade",
  eligibility_reason: "Motivo da elegibilidade",
  eligibility_evidence: "Evidência da elegibilidade",
  eligibility_source: "Origem da elegibilidade",
  eligible_territories: "Territórios",
  official_url: "Link oficial",
  accepted_formats: "Formatos",
  accepted_genres: "Gêneros",
  accepted_stages: "Estágios",
  min_budget: "Orçamento mínimo",
  max_budget: "Orçamento máximo",
};

const IGNORED = new Set(["updated_at", "eligibility_checked_at", "id", "org_id", "created_at"]);
const ACTIONS = { insert: "Criado", update: "Alterado", delete: "Excluído" } as const;

/** Valores codificados exibidos com os mesmos rótulos da interface. */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: EDITAL_STATUS_LABELS,
  review_status: { pending: "Pendente", validated: "Validado", discarded: "Descartado" },
  eligibility_status: ELIGIBILITY_LABELS,
  eligibility_source: { auto: "Regras automáticas", manual: "Equipe" },
};

function show(value: unknown, field?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  const label = field && typeof value === "string" ? VALUE_LABELS[field]?.[value] : undefined;
  if (label) return label;
  const text = Array.isArray(value) ? value.join(", ") || "—" : String(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

export function changedFields(
  entry: AuditEntry,
): { field: string; before: string; after: string }[] {
  if (entry.action !== "update" || !entry.old_data || !entry.new_data) return [];
  return Object.keys(entry.new_data)
    .filter((key) => !IGNORED.has(key))
    .filter((key) => JSON.stringify(entry.old_data![key]) !== JSON.stringify(entry.new_data![key]))
    .map((key) => ({
      field: FIELD_LABELS[key] ?? key,
      before: show(entry.old_data![key], key),
      after: show(entry.new_data![key], key),
    }));
}

export function EditalHistory({
  entries,
  error,
}: {
  entries: AuditEntry[];
  error: { message: string } | null;
}) {
  return (
    <Card>
      <SectionTitle>Histórico de alterações</SectionTitle>
      {error ? (
        <p className="text-sm text-bad">Não foi possível carregar o histórico.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma alteração registrada.</p>
      ) : (
        <ol className="space-y-4">
          {entries.map((entry) => {
            const changes = changedFields(entry);
            return (
              <li key={entry.id} className="border-l-2 border-line pl-4">
                <p className="text-sm">
                  <span className="font-medium">{ACTIONS[entry.action]}</span>{" "}
                  <span className="text-muted">
                    ·{" "}
                    {new Date(entry.created_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}{" "}
                    · {entry.actor_id ? (entry.actor_name ?? "Equipe") : "Servidor (varredura)"}
                  </span>
                </p>
                {changes.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {changes.map((change) => (
                      <li key={change.field}>
                        <span className="text-fg">{change.field}:</span> {change.before} →{" "}
                        {change.after}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
