/**
 * Um PASSO do agente: uma chamada ao modelo + execução das ferramentas pedidas.
 *
 * A execução inteira é uma sequência de passos persistidos pela aplicação (cada passo
 * cabe no tempo de uma função serverless). Garantias:
 * - a transcrição só cresce (resposta do modelo e resultados entram sem edição);
 * - toda ferramenta pedida recebe um resultado (sucesso ou erro estruturado), para o
 *   modelo decidir se continua — nada é mascarado;
 * - recusa de segurança, saída truncada e limites encerram o passo sem rodar ferramentas
 *   possivelmente incompletas.
 */
import type {
  AgentEffort,
  AgentModel,
  AgentToolCall,
  AgentToolResult,
  AgentToolSpec,
  AgentTurnResponse,
} from "./types";

export type ToolExecutor = (call: AgentToolCall) => Promise<AgentToolResult>;

export type StepOutcome =
  /** Modelo pediu ferramentas; os resultados já estão na transcrição — falta outro passo. */
  | "continue"
  /** Resposta final (sem ferramentas pendentes). */
  | "final"
  /** Recusa do classificador de segurança (após o fallback da própria API). */
  | "refused"
  /** Saída cortada por limite de tokens com ferramenta pendente: não executada. */
  | "truncated"
  /** Limite de ferramentas desta execução atingido: ferramentas extras não executadas. */
  | "tool_budget_exhausted";

export type StepResult = {
  outcome: StepOutcome;
  transcript: unknown[];
  turn: AgentTurnResponse;
  toolResults: AgentToolResult[];
  /** Texto do modelo neste passo (resposta final quando `outcome = final`). */
  text: string;
};

export async function runAgentStep(options: {
  model: AgentModel;
  system: string;
  tools: AgentToolSpec[];
  transcript: unknown[];
  effort: AgentEffort;
  executeTool: ToolExecutor;
  /** Quantas ferramentas ainda podem rodar nesta execução. */
  toolBudget: number;
}): Promise<StepResult> {
  const { model, executeTool } = options;
  // Erros do modelo sobem (classificados): a transcrição persistida fica intacta.
  const turn = await model.runTurn({
    system: options.system,
    tools: options.tools,
    transcript: options.transcript,
    effort: options.effort,
  });
  const transcript = [...options.transcript, turn.assistantMessage];

  if (turn.stopReason === "refusal") {
    return { outcome: "refused", transcript, turn, toolResults: [], text: turn.text };
  }
  if (turn.stopReason === "pause_turn") {
    return { outcome: "continue", transcript, turn, toolResults: [], text: turn.text };
  }
  if (turn.toolCalls.length === 0) {
    return {
      outcome: turn.stopReason === "max_tokens" ? "truncated" : "final",
      transcript,
      turn,
      toolResults: [],
      text: turn.text,
    };
  }
  // Ferramenta cortada no limite de tokens pode parecer um objeto válido: não executar.
  if (turn.stopReason === "max_tokens") {
    return { outcome: "truncated", transcript, turn, toolResults: [], text: turn.text };
  }

  const toolResults: AgentToolResult[] = [];
  let budget = options.toolBudget;
  let exhausted = false;
  for (const call of turn.toolCalls) {
    if (budget <= 0) {
      exhausted = true;
      toolResults.push({
        toolUseId: call.id,
        isError: true,
        content: JSON.stringify({
          erro: "limite_de_ferramentas",
          mensagem:
            "Limite de ferramentas desta execução atingido. Resuma o que foi feito e o que falta.",
        }),
      });
      continue;
    }
    budget--;
    try {
      toolResults.push(await executeTool(call));
    } catch (error) {
      toolResults.push({
        toolUseId: call.id,
        isError: true,
        content: JSON.stringify({
          erro: "falha_interna",
          mensagem:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Falha ao executar a ferramenta.",
        }),
      });
    }
  }
  // Todos os resultados num único bloco de usuário (preserva chamadas paralelas).
  transcript.push(model.toolResultsMessage(toolResults));
  return {
    outcome: exhausted ? "tool_budget_exhausted" : "continue",
    transcript,
    turn,
    toolResults,
    text: turn.text,
  };
}
