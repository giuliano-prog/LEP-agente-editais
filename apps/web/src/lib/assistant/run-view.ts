/**
 * Estado de uma execução do Assistente para a interface (sem transcrição nem segredos).
 * Módulo sem "server-only" para que o painel (cliente) use os tipos.
 */

export type RunKind = "chat" | "full_analysis";
export type RunStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";

export type RunView = {
  id: string;
  kind: RunKind;
  status: RunStatus;
  phase: string | null;
  request: string;
  stepCount: number;
  maxSteps: number;
  toolCalls: number;
  costUsd: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  startedBy: string | null;
  /** Milissegundos sugeridos antes do próximo passo (nova tentativa após falha temporária). */
  retryAfterMs: number | null;
};

export const ACTIVE_STATUSES: RunStatus[] = ["queued", "running"];

export type RunRow = {
  id: string;
  kind: string;
  status: string;
  phase: string | null;
  request: string;
  step_count: number;
  max_steps: number;
  tool_calls: number;
  cost_usd: number | string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  started_by: string | null;
  attempts: number;
};

export function toRunView(row: RunRow, retryAfterMs: number | null = null): RunView {
  return {
    id: row.id,
    kind: row.kind === "full_analysis" ? "full_analysis" : "chat",
    status: (["queued", "running", "completed", "partial", "failed", "cancelled"].includes(
      row.status,
    )
      ? row.status
      : "failed") as RunStatus,
    phase: row.phase,
    request: row.request,
    stepCount: row.step_count,
    maxSteps: row.max_steps,
    toolCalls: row.tool_calls,
    costUsd: Number(row.cost_usd) || 0,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    startedBy: row.started_by,
    retryAfterMs,
  };
}

export const RUN_COLUMNS =
  "id, kind, status, phase, request, step_count, max_steps, tool_calls, cost_usd, error, started_at, finished_at, started_by, attempts";
