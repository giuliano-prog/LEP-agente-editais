/**
 * Contrato do agente com ferramentas (ADR-0027), independente de fornecedor.
 *
 * O modelo NUNCA executa nada: ele pede ferramentas (`toolCalls`) e a aplicação decide,
 * valida e executa com a sessão do usuário (RLS). A transcrição é guardada no formato
 * nativo do fornecedor (`unknown[]`) e só é manipulada pelo próprio adaptador, para que
 * as continuações sejam "só acrescentar" (append-only) e válidas para o fornecedor.
 */

/** JSON Schema de entrada de uma ferramenta (objeto, sem propriedades extras). */
export type JsonSchema = Record<string, unknown>;

export type AgentToolKind = "read" | "write" | "proposal";

export type AgentToolSpec = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  kind: AgentToolKind;
};

export type AgentToolCall = { id: string; name: string; input: unknown };

export type AgentToolResult = { toolUseId: string; content: string; isError: boolean };

export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type AgentStopReason =
  "end_turn" | "tool_use" | "max_tokens" | "refusal" | "pause_turn" | "other";

export type AgentTurnRequest = {
  system: string;
  tools: AgentToolSpec[];
  /** Mensagens nativas do fornecedor, na ordem; nunca editadas, só acrescentadas. */
  transcript: unknown[];
  effort: AgentEffort;
};

export type AgentTurnResponse = {
  /** Mensagem do assistente no formato nativo — acrescentada à transcrição sem alteração. */
  assistantMessage: unknown;
  text: string;
  toolCalls: AgentToolCall[];
  stopReason: AgentStopReason;
  usage: AgentUsage;
  costUsd: number;
  provider: string;
  /** Modelo que efetivamente respondeu (pode diferir em caso de fallback). */
  model: string;
  durationMs: number;
  fallbackUsed: boolean;
};

export interface AgentModel {
  readonly provider: string;
  readonly model: string;
  runTurn(request: AgentTurnRequest): Promise<AgentTurnResponse>;
  /** Mensagem de usuário (texto) no formato nativo. */
  userMessage(text: string): unknown;
  /** Resultados das ferramentas pedidas no turno anterior, num ÚNICO bloco de usuário. */
  toolResultsMessage(results: AgentToolResult[]): unknown;
}

/** Falha classificada de uma chamada ao modelo (para decidir nova tentativa e avisar a pessoa). */
export type AgentErrorKind =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "overloaded"
  | "bad_request"
  | "network"
  | "unknown";

export class AgentModelError extends Error {
  constructor(
    readonly kind: AgentErrorKind,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AgentModelError";
  }
}
