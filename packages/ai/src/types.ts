/**
 * Contrato único para qualquer fornecedor de IA (decisão ADR-0006).
 * Nenhum módulo deve importar SDKs de fornecedores diretamente: todos usam `AiProvider`.
 * Implementações concretas (Anthropic, OpenAI, etc.) serão adicionadas quando o
 * primeiro módulo precisar de IA.
 */

export type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiRequest = {
  /** Identifica o uso (ex.: "captacao.extract_call"), para relatórios de custo. */
  purpose: string;
  /** Modelo lógico ("fast" | "capable") ou id específico do fornecedor. */
  model: string;
  system?: string;
  messages: AiMessage[];
  maxOutputTokens?: number;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Tokens lidos do cache do fornecedor, quando houver. */
  cachedInputTokens?: number;
};

export type AiResponse = {
  text: string;
  provider: string;
  model: string;
  usage: AiUsage;
  /** Custo estimado em USD calculado pela implementação a partir da tabela de preços. */
  costUsd: number;
  durationMs: number;
};

export interface AiProvider {
  readonly name: string;
  complete(request: AiRequest): Promise<AiResponse>;
}

/** Registro que vai para `core.ai_usage`. */
export type AiUsageRecord = {
  orgId: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
  durationMs: number;
  status: "success" | "error";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
};

export interface AiUsageRecorder {
  record(entry: AiUsageRecord): Promise<void>;
}
