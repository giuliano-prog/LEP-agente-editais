import { ADHERENCE_LABELS, type Adherence, type AdherenceLevel } from "@lep/funding";
import { Badge, type BadgeTone } from "@/components/ui";

const TONES: Record<AdherenceLevel, BadgeTone> = {
  high: "ok",
  medium: "warn",
  low: "bad",
  none: "neutral",
};

/** Aderência à carteira LEP (melhor Match). Compatibilidade técnica — não é chance de aprovação. */
export function AdherenceCell({ adherence }: { adherence: Adherence | null }) {
  if (!adherence) return <span className="text-muted">—</span>;
  return (
    <div className="space-y-1">
      <Badge tone={TONES[adherence.level]}>{ADHERENCE_LABELS[adherence.level]}</Badge>
      {adherence.best && (
        <p
          className="text-xs text-muted"
          title="Melhor projeto e quantos projetos não têm impedimentos registrados"
        >
          {adherence.best.projectTitle} · {adherence.compatibleProjects}/{adherence.totalProjects}{" "}
          compatível(is)
        </p>
      )}
    </div>
  );
}
