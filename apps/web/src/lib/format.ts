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

/** Data e hora no horário de Brasília, nos formatos dos campos <input type="date|time">. */
export function toBrasiliaInputs(value: string | null | undefined): { date: string; time: string } {
  const date = parseDeadline(value ?? null);
  if (!date) return { date: "", time: "" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** Número para campo de texto no formato brasileiro (1500000 → "1.500.000,00"). */
export function toMoneyInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
