import "server-only";

import {
  AgentModelError,
  createAnthropicAgentModel,
  resolveAssistantConfig,
  RUN_PROFILES,
  runAgentStep,
  type AgentModel,
} from "@lep/ai";
import type { Database, Json } from "@lep/db";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";
import {
  buildRunOpening,
  ASSISTANT_SYSTEM_PROMPT,
  FULL_ANALYSIS_REQUEST,
  type RecentMessage,
} from "./prompt";
import type { AssistantStore } from "./store";
import { createSupabaseAssistantStore } from "./supabase-store";
import { phaseLabel, summarizeRun, type RunSummary } from "./summary";
import {
  ACTIVE_STATUSES,
  RUN_COLUMNS,
  toRunView,
  type RunKind,
  type RunRow,
  type RunStatus,
  type RunView,
} from "./run-view";
import { ASSISTANT_TOOL_SPECS, createToolExecutor } from "./tools";

/**
 * Execuções do Assistente LEP (ADR-0027).
 *
 * Sem fila/worker na infraestrutura atual: cada execução é persistida em core.agent_runs e
 * avançada UM PASSO por requisição (uma chamada ao Claude + as ferramentas pedidas). O
 * navegador chama `advanceRun` em sequência; recarregar a página não perde nada — a execução
 * continua de onde parou. Uma trava curta (`lease_until`) impede dois passos simultâneos.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
type UsageInsert = Omit<Database["core"]["Tables"]["ai_usage"]["Insert"], "org_id">;
type RunUpdate = Database["core"]["Tables"]["agent_runs"]["Update"];

export { ACTIVE_STATUSES, toRunView, type RunKind, type RunStatus, type RunView } from "./run-view";

const LEASE_MS = 290_000;
const MAX_ATTEMPTS = 3;

type Scope = {
  supabase: Supabase;
  orgId: string;
  userId: string;
  workspaceId: string;
  editalId: string;
};

export class AssistantRunError extends Error {}

function todayIn(now: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
  }).format(now);
}

async function ensureConversation(scope: Scope): Promise<{ id: string; summary: string | null }> {
  const { supabase, orgId, workspaceId } = scope;
  const { data } = await supabase
    .from("assistant_conversations")
    .select("id, summary")
    .eq("workspace_id", workspaceId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (data) return data;
  const created = await supabase
    .from("assistant_conversations")
    .insert({ org_id: orgId, workspace_id: workspaceId })
    .select("id, summary")
    .single();
  if (created.error || !created.data) {
    // Corrida: outra aba criou ao mesmo tempo (índice único) — lê de novo.
    const again = await supabase
      .from("assistant_conversations")
      .select("id, summary")
      .eq("workspace_id", workspaceId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (again.data) return again.data;
    throw new AssistantRunError(
      "Não foi possível iniciar a conversa (verifique se as migrações foram aplicadas).",
    );
  }
  return created.data;
}

/**
 * Dependências substituíveis (testes usam modelo falso e loja em memória; a aplicação usa
 * o Claude real e a loja do Supabase com a sessão do usuário).
 */
export type RunDeps = {
  buildModel?: () => { model: AgentModel } | { error: string };
  createStore?: (options: {
    supabase: Supabase;
    orgId: string;
    workspaceId: string;
    editalId: string;
    runId: string | null;
    step: number;
  }) => AssistantStore;
  recordUsage?: (orgId: string, entry: UsageInsert) => Promise<void>;
};

function buildModel(): { model: AgentModel } | { error: string } {
  const config = resolveAssistantConfig();
  if (!config.configured) return { error: config.reason };
  return { model: createAnthropicAgentModel({ apiKey: config.apiKey, model: config.model }) };
}

/** Cria a execução (pedido da pessoa + contexto mínimo). Não chama o modelo. */
export async function startRun(
  scope: Scope & { requesterName: string | null },
  input: { kind: RunKind; request: string | null },
  deps: RunDeps = {},
): Promise<RunView> {
  const built = (deps.buildModel ?? buildModel)();
  if ("error" in built) throw new AssistantRunError(built.error);
  const { supabase, orgId, workspaceId } = scope;
  const request = (
    input.kind === "full_analysis"
      ? input.request?.trim() || FULL_ANALYSIS_REQUEST
      : (input.request?.trim() ?? "")
  ).slice(0, 8000);
  if (!request) throw new AssistantRunError("Escreva o pedido para o Assistente.");

  const active = await supabase
    .from("agent_runs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("org_id", orgId)
    .in("status", ACTIVE_STATUSES)
    .limit(1);
  if ((active.data ?? []).length > 0) {
    throw new AssistantRunError(
      "Já existe uma execução em andamento nesta inscrição. Aguarde ou cancele.",
    );
  }

  const conversation = await ensureConversation(scope);
  const now = new Date();
  // Contexto inicial: a mesma visão geral que a ferramenta devolve (sem auditar).
  const store = (deps.createStore ?? createSupabaseAssistantStore)({
    ...scope,
    runId: null,
    step: 0,
  });
  const overview = await createToolExecutor({ store, now })({
    id: "ctx",
    name: "consultar_area_trabalho",
    input: {},
  });
  const recent = await supabase
    .from("assistant_messages")
    .select("role, content, author_id, profiles:author_id ( full_name )")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(8);
  const recentMessages: RecentMessage[] = (recent.data ?? []).reverse().map((row) => ({
    role: row.role === "assistant" ? "assistant" : row.role === "notice" ? "notice" : "user",
    content: row.content,
    author: (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles)?.full_name ?? null,
  }));

  const opening = buildRunOpening({
    request,
    today: todayIn(now),
    requesterName: scope.requesterName,
    overview: overview.isError
      ? { aviso: "contexto indisponível; use as ferramentas" }
      : JSON.parse(overview.content),
    recent: recentMessages,
    conversationSummary: conversation.summary,
  });
  const profile = RUN_PROFILES[input.kind];

  const { data: run, error } = await supabase
    .from("agent_runs")
    .insert({
      org_id: orgId,
      conversation_id: conversation.id,
      workspace_id: workspaceId,
      kind: input.kind,
      status: "queued",
      phase: phaseLabel(null),
      request,
      provider: built.model.provider,
      model: built.model.model,
      max_steps: profile.maxSteps,
    })
    .select(RUN_COLUMNS)
    .single();
  if (error || !run) {
    console.error("Erro ao criar execução do assistente:", error?.code, error?.message);
    throw new AssistantRunError("Não foi possível iniciar o Assistente.");
  }
  const transcript = [built.model.userMessage(opening)];
  await supabase
    .from("agent_runs")
    .update({ transcript: transcript as unknown as Json })
    .eq("id", run.id)
    .eq("org_id", orgId);
  await supabase.from("assistant_messages").insert({
    org_id: orgId,
    conversation_id: conversation.id,
    run_id: run.id,
    role: "user",
    content:
      input.kind === "full_analysis" && !input.request ? "Analisar inscrição com IA." : request,
    author_id: scope.userId,
  });
  return toRunView(run as RunRow);
}

async function recordUsage(orgId: string, entry: UsageInsert) {
  // Custo por chamada: só o servidor grava em core.ai_usage (ADR-0006); insert-only, por org.
  if (!isAdminClientConfigured()) return;
  try {
    await createAdminClient()
      .from("ai_usage")
      .insert({ org_id: orgId, ...entry });
  } catch (error) {
    console.error(
      "Registro de custo de IA falhou:",
      error instanceof Error ? error.message : error,
    );
  }
}

async function finalize(
  scope: Scope,
  run: { id: string; conversation_id: string },
  status: Exclude<RunStatus, "queued" | "running">,
  text: string,
  extra: { error?: string | null } = {},
): Promise<RunSummary> {
  const { supabase, orgId } = scope;
  const { data: actions } = await supabase
    .from("agent_actions")
    .select("tool, kind, status, input, after_data")
    .eq("run_id", run.id)
    .eq("org_id", orgId);
  const summary = summarizeRun(actions ?? []);
  const content =
    text.trim() ||
    (status === "completed"
      ? "Concluí a execução."
      : "A execução terminou antes do previsto. O que já foi feito ficou salvo na Área de Trabalho.");
  // Quem grava o estado final primeiro (passo, cancelamento ou outra aba) escreve a
  // mensagem; os demais não duplicam.
  const { data: closed } = await supabase
    .from("agent_runs")
    .update({
      status,
      phase:
        status === "completed"
          ? "Análise concluída."
          : status === "partial"
            ? "Concluída parcialmente."
            : status === "cancelled"
              ? "Cancelada."
              : "Falhou.",
      finished_at: new Date().toISOString(),
      lease_until: null,
      result: summary as unknown as Json,
      error: extra.error ?? null,
    })
    .eq("id", run.id)
    .eq("org_id", orgId)
    .in("status", ACTIVE_STATUSES)
    .select("id")
    .maybeSingle();
  if (!closed) return summary;
  const answered = status === "completed" || status === "partial";
  await supabase.from("assistant_messages").insert({
    org_id: orgId,
    conversation_id: run.conversation_id,
    run_id: run.id,
    role: answered ? "assistant" : "notice",
    content: content.slice(0, 40_000),
    author_id: null,
    metadata: { status, summary } as unknown as Json,
  });
  if (answered) {
    // Memória curta da conversa: o último trabalho concluído (contexto da próxima execução).
    await supabase
      .from("assistant_conversations")
      .update({ summary: content.slice(0, 4000) })
      .eq("id", run.conversation_id)
      .eq("org_id", orgId);
  }
  return summary;
}

/** Avança UM passo da execução. Idempotente sob concorrência (trava de passo). */
export async function advanceRun(
  scope: Scope,
  runId: string,
  deps: RunDeps = {},
): Promise<RunView> {
  const record = deps.recordUsage ?? recordUsage;
  const { supabase, orgId } = scope;
  const now = new Date();
  const claimed = await supabase
    .from("agent_runs")
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString(), status: "running" })
    .eq("id", runId)
    .eq("org_id", orgId)
    .eq("workspace_id", scope.workspaceId)
    .in("status", ACTIVE_STATUSES)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select(
      `${RUN_COLUMNS}, conversation_id, transcript, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, kind`,
    )
    .maybeSingle();

  if (!claimed.data) {
    const { data } = await supabase
      .from("agent_runs")
      .select(RUN_COLUMNS)
      .eq("id", runId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!data) throw new AssistantRunError("Execução não encontrada.");
    // Outro passo em andamento (outra aba): o cliente consulta de novo em instantes.
    return toRunView(
      data as RunRow,
      ACTIVE_STATUSES.includes(data.status as RunStatus) ? 3000 : null,
    );
  }
  const run = claimed.data;
  const release = async (fields: RunUpdate) => {
    const { data } = await supabase
      .from("agent_runs")
      .update({ ...fields, lease_until: null })
      .eq("id", run.id)
      .eq("org_id", orgId)
      .select(RUN_COLUMNS)
      .single();
    return data as RunRow;
  };

  const built = (deps.buildModel ?? buildModel)();
  if ("error" in built) {
    await finalize(scope, run, "failed", `O Assistente não está configurado: ${built.error}`, {
      error: built.error,
    });
    return toRunView(
      (await supabase.from("agent_runs").select(RUN_COLUMNS).eq("id", run.id).single())
        .data as RunRow,
    );
  }

  const profile = RUN_PROFILES[run.kind === "full_analysis" ? "full_analysis" : "chat"];
  const step = run.step_count + 1;
  const store = (deps.createStore ?? createSupabaseAssistantStore)({
    ...scope,
    runId: run.id,
    step,
  });
  let lastTool: string | null = null;
  const execute = createToolExecutor({
    store,
    now,
    onExecuted: (executed) => {
      lastTool = executed.name;
    },
  });

  let result;
  try {
    result = await runAgentStep({
      model: built.model,
      system: ASSISTANT_SYSTEM_PROMPT,
      tools: ASSISTANT_TOOL_SPECS,
      transcript: Array.isArray(run.transcript) ? (run.transcript as unknown[]) : [],
      effort: profile.effort,
      executeTool: execute,
      toolBudget: Math.max(0, profile.maxToolCalls - run.tool_calls),
    });
  } catch (error) {
    const failure =
      error instanceof AgentModelError
        ? error
        : new AgentModelError(
            "unknown",
            error instanceof Error ? error.message.slice(0, 300) : "Erro desconhecido.",
            false,
          );
    const attempts = run.attempts + 1;
    await record(orgId, {
      purpose: `assistente.${run.kind}`,
      provider: built.model.provider,
      model: built.model.model,
      status: "error",
      error_message: failure.message.slice(0, 500),
      metadata: { run_id: run.id, step, kind: failure.kind },
    });
    if (failure.retryable && attempts < MAX_ATTEMPTS) {
      const row = await release({
        attempts,
        error: failure.message,
        phase: `Falha temporária (${failure.kind}); nova tentativa ${attempts + 1} de ${MAX_ATTEMPTS}…`,
      });
      return toRunView(row, 4000 * attempts);
    }
    await supabase.from("agent_runs").update({ attempts }).eq("id", run.id).eq("org_id", orgId);
    await finalize(
      scope,
      run,
      "failed",
      `Não consegui concluir: ${failure.message} O que já tinha sido feito continua salvo na Área de Trabalho; você pode tentar de novo.`,
      { error: failure.message },
    );
    return toRunView(
      (await supabase.from("agent_runs").select(RUN_COLUMNS).eq("id", run.id).single())
        .data as RunRow,
    );
  }

  const turn = result.turn;
  await record(orgId, {
    purpose: `assistente.${run.kind}`,
    provider: turn.provider,
    model: turn.model,
    input_tokens: turn.usage.inputTokens,
    output_tokens: turn.usage.outputTokens,
    cached_input_tokens: turn.usage.cacheReadTokens,
    cost_usd: turn.costUsd,
    duration_ms: turn.durationMs,
    status: "success",
    metadata: {
      run_id: run.id,
      step,
      tools: result.toolResults.length,
      fallback: turn.fallbackUsed,
    },
  });

  const counters = {
    transcript: result.transcript as unknown as Json,
    step_count: step,
    tool_calls: run.tool_calls + result.toolResults.length,
    input_tokens: run.input_tokens + turn.usage.inputTokens,
    output_tokens: run.output_tokens + turn.usage.outputTokens,
    cache_read_tokens: run.cache_read_tokens + turn.usage.cacheReadTokens,
    cache_write_tokens: run.cache_write_tokens + turn.usage.cacheWriteTokens,
    cost_usd: Number(run.cost_usd) + turn.costUsd,
    attempts: 0,
    error: null,
    phase: phaseLabel(lastTool),
  };

  const current = await supabase
    .from("agent_runs")
    .select("status")
    .eq("id", run.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (current.data && !ACTIVE_STATUSES.includes(current.data.status as RunStatus)) {
    // Cancelada durante o passo: guarda os contadores (custo real) e não continua.
    return toRunView(await release(counters));
  }

  if (result.outcome === "final") {
    await supabase.from("agent_runs").update(counters).eq("id", run.id).eq("org_id", orgId);
    await finalize(scope, run, "completed", result.text);
  } else if (result.outcome === "refused" || result.outcome === "truncated") {
    await supabase.from("agent_runs").update(counters).eq("id", run.id).eq("org_id", orgId);
    await finalize(
      scope,
      run,
      "partial",
      result.outcome === "refused"
        ? "O modelo recusou continuar este pedido por política de segurança. O que já foi feito ficou salvo; reformule o pedido se precisar."
        : "A resposta ficou longa demais e foi interrompida. O que já foi feito ficou salvo; peça a continuação.",
    );
  } else if (step >= run.max_steps) {
    await supabase.from("agent_runs").update(counters).eq("id", run.id).eq("org_id", orgId);
    await finalize(
      scope,
      run,
      "partial",
      `${result.text ? `${result.text}\n\n` : ""}Atingi o limite de ${run.max_steps} passos desta execução. Tudo o que fiz ficou salvo; peça "continue" para eu seguir de onde parei.`,
    );
  } else {
    const row = await release(counters);
    return toRunView(row);
  }
  return toRunView(
    (await supabase.from("agent_runs").select(RUN_COLUMNS).eq("id", run.id).single())
      .data as RunRow,
  );
}

export async function cancelRun(scope: Scope, runId: string): Promise<void> {
  const { supabase, orgId } = scope;
  const { data } = await supabase
    .from("agent_runs")
    .select("id, conversation_id, status")
    .eq("id", runId)
    .eq("org_id", orgId)
    .eq("workspace_id", scope.workspaceId)
    .maybeSingle();
  if (!data || !ACTIVE_STATUSES.includes(data.status as RunStatus)) return;
  await finalize(
    scope,
    data,
    "cancelled",
    "Execução cancelada pela equipe. O que já tinha sido feito ficou salvo.",
  );
}
