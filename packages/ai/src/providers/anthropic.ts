/**
 * Adaptador Anthropic (Claude) do agente — ÚNICO lugar do projeto que importa o SDK
 * oficial `@anthropic-ai/sdk` (ADR-0006/0027). Roda só no servidor.
 *
 * Decisões (documentação oficial da Anthropic, 2026-10):
 * - Messages API com ferramentas definidas pela aplicação e laço controlado por nós
 *   (cada passo é persistido; aprovações e auditoria ficam do nosso lado).
 * - `strict: true` nas ferramentas: os argumentos sempre seguem o schema (`tool_choice`
 *   forçado não existe no Claude Opus 5.5; usamos `auto` + instrução no prompt).
 * - Pensamento adaptativo (sempre ligado no Opus 5.5) e `output_config.effort` por perfil.
 * - Cache de prompt: prompt de sistema e ferramentas fixos + cache automático da conversa.
 * - `fallbacks: "default"` (beta server-side-fallback-2026-07-01): se um classificador de
 *   segurança recusar, a própria API tenta o modelo recomendado; `refusal` é tratado.
 * - Transcrição só cresce (nada é editado), como exige o "preserved thinking".
 */
import Anthropic from "@anthropic-ai/sdk";
import { CALL_LIMITS, estimateCostUsd } from "../agent/config";
import {
  AgentModelError,
  type AgentModel,
  type AgentStopReason,
  type AgentToolCall,
  type AgentToolResult,
  type AgentTurnRequest,
  type AgentTurnResponse,
} from "../agent/types";

type Message = Anthropic.Beta.Messages.BetaMessage;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function stopReasonOf(reason: string | null): AgentStopReason {
  switch (reason) {
    case "end_turn":
    case "tool_use":
    case "max_tokens":
    case "refusal":
    case "pause_turn":
      return reason;
    case "model_context_window_exceeded":
      return "max_tokens";
    default:
      return "other";
  }
}

/** Erros do SDK → falha classificada (mais específico primeiro; sem comparar mensagens). */
export function classifyAnthropicError(error: unknown): AgentModelError {
  if (error instanceof AgentModelError) return error;
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AgentModelError("auth", "Chave da Anthropic inválida ou sem permissão.", false);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AgentModelError(
      "rate_limit",
      "Limite de uso da API da Anthropic atingido. Tente em instantes.",
      true,
    );
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AgentModelError("timeout", "A chamada ao Claude excedeu o tempo limite.", true);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AgentModelError(
      "bad_request",
      `Requisição recusada pela API: ${error.message}`.slice(0, 500),
      false,
    );
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new AgentModelError(
      "overloaded",
      "A API da Anthropic está indisponível ou sobrecarregada.",
      true,
    );
  }
  if (error instanceof Anthropic.APIError && error.status === 529) {
    return new AgentModelError("overloaded", "A API da Anthropic está sobrecarregada.", true);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AgentModelError("network", "Falha de conexão com a API da Anthropic.", true);
  }
  if (error instanceof Anthropic.APIError) {
    return new AgentModelError(
      "unknown",
      `Erro da API da Anthropic (${error.status}).`,
      (error.status ?? 0) >= 500,
    );
  }
  return new AgentModelError(
    "unknown",
    error instanceof Error ? error.message.slice(0, 300) : "Erro desconhecido.",
    false,
  );
}

export function createAnthropicAgentModel(options: {
  apiKey: string;
  model: string;
  /** Para testes: cliente já construído. */
  client?: Anthropic;
}): AgentModel {
  const client =
    options.client ??
    new Anthropic({
      apiKey: options.apiKey,
      timeout: CALL_LIMITS.timeoutMs,
      maxRetries: CALL_LIMITS.maxRetries,
    });

  return {
    provider: "anthropic",
    model: options.model,

    userMessage(text: string): MessageParam {
      return { role: "user", content: [{ type: "text", text }] };
    },

    toolResultsMessage(results: AgentToolResult[]): MessageParam {
      return {
        role: "user",
        content: results.map((result) => ({
          type: "tool_result" as const,
          tool_use_id: result.toolUseId,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        })),
      };
    },

    async runTurn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
      const startedAt = Date.now();
      let message: Message;
      try {
        message = await client.beta.messages.create({
          model: options.model,
          max_tokens: CALL_LIMITS.maxOutputTokens,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: request.effort },
          // Prefixo estável (sistema + ferramentas) com breakpoint explícito; a conversa usa
          // o cache automático no último bloco.
          system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          cache_control: { type: "ephemeral" },
          tools: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema,
            strict: true,
          })),
          tool_choice: { type: "auto" },
          messages: request.transcript as MessageParam[],
        });
      } catch (error) {
        throw classifyAnthropicError(error);
      }

      const toolCalls: AgentToolCall[] = [];
      const texts: string[] = [];
      for (const block of message.content) {
        if (block.type === "tool_use")
          toolCalls.push({ id: block.id, name: block.name, input: block.input });
        else if (block.type === "text") texts.push(block.text);
      }
      const usage = {
        inputTokens: message.usage.input_tokens ?? 0,
        outputTokens: message.usage.output_tokens ?? 0,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      };
      const iterations =
        (message.usage as { iterations?: { type?: string }[] | null }).iterations ?? [];
      return {
        // A mensagem inteira (inclusive blocos de pensamento) volta sem alteração.
        assistantMessage: { role: "assistant", content: message.content } satisfies MessageParam,
        text: texts.join("\n").trim(),
        toolCalls,
        stopReason: stopReasonOf(message.stop_reason),
        usage,
        costUsd: estimateCostUsd(message.model, usage),
        provider: "anthropic",
        model: message.model,
        durationMs: Date.now() - startedAt,
        fallbackUsed: iterations.some((entry) => entry.type === "fallback_message"),
      };
    },
  };
}
