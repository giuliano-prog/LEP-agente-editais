import { parseDeadline } from "@lep/funding";

const TIME_ZONE = "America/Sao_Paulo";

export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

/** Data no fuso de Brasília. Datas simples ("2026-10-10") são exibidas como o próprio dia. */
export function formatDate(value: string | null | undefined): string {
  const date = parseDeadline(value ?? null);
  if (!date) return "—";
  return date.toLocaleDateString("pt-BR", { timeZone: TIME_ZONE });
}

/** Dias (arredondados para cima) até o prazo; negativo se já passou. */
export function daysUntil(value: string | null | undefined, now: Date = new Date()): number | null {
  const date = parseDeadline(value ?? null);
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}
