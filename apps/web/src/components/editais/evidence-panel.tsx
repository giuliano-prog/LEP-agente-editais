import { FIELD_LABELS, type Edital, type FieldKey } from "@lep/funding";
import { labelOf, PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { formatBRL, formatDate } from "@/lib/format";

const VOCABULARY: Partial<Record<FieldKey, Record<string, string>>> = {
  formats: PROJECT_FORMATS,
  genres: PROJECT_GENRES,
  stages: PROJECT_STAGES,
};

function show(key: FieldKey, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key === "deadline" || key === "opensAt") return formatDate(String(value));
  if (key === "totalAmount" || key === "maxAmountPerProject") return formatBRL(Number(value));
  if (Array.isArray(value))
    return value.map((code) => labelOf(VOCABULARY[key] ?? {}, String(code))).join(", ");
  return String(value);
}

/** Aba "Dados e evidências": cada valor sugerido pelas regras com o trecho de onde veio. */
export function EvidencePanel({ edital }: { edital: Edital }) {
  const entries = (Object.keys(FIELD_LABELS) as FieldKey[]).filter(
    (key) => edital.fieldEvidence[key],
  );
  return (
    <Card>
      <SectionTitle>Evidências da extração automática</SectionTitle>
      {edital.extractionNotes.length > 0 && (
        <ul className="mb-4 space-y-1 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {edital.extractionNotes.map((note) => (
            <li key={note}>⚠ {note}</li>
          ))}
        </ul>
      )}
      {entries.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum campo extraído automaticamente (cadastro manual, ou o texto não trazia as
          informações). Confira o documento oficial.
        </p>
      ) : (
        <dl className="space-y-4">
          {entries.map((key) => {
            const evidence = edital.fieldEvidence[key]!;
            return (
              <div key={key} className="space-y-1">
                <dt className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">{FIELD_LABELS[key]}:</span>
                  <span className="font-medium">{show(key, evidence.value)}</span>
                  <Badge tone={evidence.source === "pdf" ? "brand" : "neutral"}>
                    {evidence.label ?? (evidence.source === "pdf" ? "PDF" : "Página")}
                  </Badge>
                  {edital.evidenceConflicts.includes(key) && (
                    <Badge tone="warn">Página e regulamento divergem</Badge>
                  )}
                </dt>
                <dd className="border-l-2 border-brand/60 pl-3 text-sm italic text-muted">
                  “{evidence.snippet}”
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className="mt-4 text-xs text-muted">
        Valores sugeridos por regras de texto (sem IA), a partir da página e do regulamento em PDF
        (sem OCR). São sugestões: confira e ajuste em “Editar e revisar”.
      </p>
    </Card>
  );
}
