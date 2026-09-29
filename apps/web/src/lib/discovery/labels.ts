/** Limites que interrompem as buscas da descoberta web (sem "server-only": usado na tela). */
export type DiscoveryLimitReason = "per_run" | "per_month" | "raw_results" | "reservation_failed";

export const DISCOVERY_LIMIT_LABELS: Record<DiscoveryLimitReason, string> = {
  per_run: "Limite de chamadas por execução atingido (WEB_SEARCH_MAX_REQUESTS_PER_RUN).",
  per_month: "Limite mensal de chamadas atingido (WEB_SEARCH_MAX_REQUESTS_PER_MONTH).",
  raw_results: "Teto de resultados brutos da execução atingido (WEB_DISCOVERY_MAX_RAW_RESULTS).",
  reservation_failed:
    "Não foi possível reservar a chamada no contador mensal: nenhuma busca nova foi feita (segurança).",
};

export const limitLabel = (reason: string | null | undefined) =>
  reason && reason in DISCOVERY_LIMIT_LABELS
    ? DISCOVERY_LIMIT_LABELS[reason as DiscoveryLimitReason]
    : null;
