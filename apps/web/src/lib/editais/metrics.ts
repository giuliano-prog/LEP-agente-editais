import { CLOSED_STATUSES, parseDeadline, type Edital } from "@lep/funding";
import { isAutomaticOrigin } from "./constants";

/** Dias até o prazo para contar como "Próximo do prazo". */
export const DEADLINE_SOON_DAYS = 15;

type Row = Pick<Edital, "status" | "reviewStatus" | "origin" | "deadline">;

/** Ativo = não descartado e com inscrições abertas ou em breve. */
export function isActiveEdital(edital: Row): boolean {
  return (
    edital.reviewStatus !== "discarded" &&
    (edital.status === "open" || edital.status === "upcoming") &&
    !(edital.status && CLOSED_STATUSES.has(edital.status))
  );
}

/** Novo para revisar = trazido pela varredura/busca web e ainda não validado nem descartado. */
export function needsReview(edital: Row): boolean {
  return (
    isAutomaticOrigin(edital.origin) &&
    edital.reviewStatus !== "validated" &&
    edital.reviewStatus !== "discarded"
  );
}

/** Ativo com prazo final nos próximos `days` dias (inclui hoje). */
export function isDeadlineSoon(edital: Row, now: Date, days = DEADLINE_SOON_DAYS): boolean {
  if (!isActiveEdital(edital)) return false;
  const deadline = parseDeadline(edital.deadline);
  if (!deadline) return false;
  const diff = deadline.getTime() - now.getTime();
  return diff >= 0 && diff <= days * 86_400_000;
}

export function editalMetrics(editais: Row[], now: Date) {
  return {
    active: editais.filter(isActiveEdital).length,
    toReview: editais.filter(needsReview).length,
    deadlineSoon: editais.filter((edital) => isDeadlineSoon(edital, now)).length,
  };
}
