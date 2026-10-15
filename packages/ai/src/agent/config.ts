/**
 * Configuração CENTRAL do Assistente LEP (ADR-0027): modelo, esforço, limites e preços.
 * Trocar de modelo = mudar aqui (ou a variável LEP_ASSISTANT_MODEL), sem tocar no agente.
 */
import type { AgentEffort } from "./types";

/**
 * Modelo padrão: Claude Opus 5.5 — o Opus atual, indicado para análise complexa de
 * documentos longos com uso de ferramentas (1M de contexto, pensamento adaptativo).
 */
export const DEFAULT_ASSISTANT_MODEL = "claude-opus-5-5";

/** Modelos aceitos na variável LEP_ASSISTANT_MODEL (evita erro de digitação em produção). */
export const SUPPORTED_ASSISTANT_MODELS = [
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
] as const;

export type AssistantModelId = (typeof SUPPORTED_ASSISTANT_MODELS)[number];

/** Preço por milhão de tokens (USD), tabela pública da Anthropic. Estimativa de custo. */
export const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

export function estimateCostUsd(
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  },
): number {
  const price = MODEL_PRICING[model] ?? MODEL_PRICING[DEFAULT_ASSISTANT_MODEL]!;
  const cost =
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export type AssistantRunProfile = {
  effort: AgentEffort;
  /** Passos (chamadas ao modelo) por execução. */
  maxSteps: number;
  /** Ferramentas por execução (proteção contra laço). */
  maxToolCalls: number;
};

/** Análise completa: mais esforço e mais passos; conversa: mais leve. */
export const RUN_PROFILES: Record<"full_analysis" | "chat", AssistantRunProfile> = {
  full_analysis: { effort: "high", maxSteps: 30, maxToolCalls: 120 },
  chat: { effort: "medium", maxSteps: 14, maxToolCalls: 50 },
};

/** Limites de cada chamada (cabe com folga no tempo de uma função da Vercel). */
export const CALL_LIMITS = {
  maxOutputTokens: 16_000,
  timeoutMs: 170_000,
  maxRetries: 1,
} as const;

export type AssistantConfig =
  | { configured: true; apiKey: string; model: AssistantModelId }
  | { configured: false; reason: string; model: AssistantModelId };

/**
 * Lê a configuração do servidor. A chave NUNCA vai para o navegador nem para logs:
 * esta função só é chamada em código de servidor e não expõe o valor.
 */
export function resolveAssistantConfig(
  env: Record<string, string | undefined> = process.env,
): AssistantConfig {
  const requested = env.LEP_ASSISTANT_MODEL?.trim();
  const model = (SUPPORTED_ASSISTANT_MODELS as readonly string[]).includes(requested ?? "")
    ? (requested as AssistantModelId)
    : DEFAULT_ASSISTANT_MODEL;
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      model,
      reason:
        "ANTHROPIC_API_KEY não configurada no servidor. Configure em Vercel → Settings → Environment Variables.",
    };
  }
  return { configured: true, apiKey, model };
}
