import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { classifyAnthropicError, createAnthropicAgentModel } from "../providers/anthropic";
import { DEFAULT_ASSISTANT_MODEL, estimateCostUsd, resolveAssistantConfig } from "./config";
import { s } from "./schema";
import { runAgentStep } from "./step";
import type { AgentModel, AgentTurnResponse } from "./types";

const usage = { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 };

function fakeModel(turns: Partial<AgentTurnResponse>[]): AgentModel & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  let index = 0;
  return {
    provider: "fake",
    model: "fake-model",
    calls,
    userMessage: (text) => ({ role: "user", text }),
    toolResultsMessage: (results) => ({ role: "user", results }),
    async runTurn(request) {
      calls.push(request.transcript);
      const turn = turns[index++] ?? {};
      return {
        assistantMessage: { role: "assistant", n: index },
        text: "",
        toolCalls: [],
        stopReason: "end_turn",
        usage,
        costUsd: 0.01,
        provider: "fake",
        model: "fake-model",
        durationMs: 1,
        fallbackUsed: false,
        ...turn,
      };
    },
  };
}

describe("resolveAssistantConfig", () => {
  it("sem ANTHROPIC_API_KEY: não configurado, com orientação (sem expor nada)", () => {
    const config = resolveAssistantConfig({});
    expect(config.configured).toBe(false);
    expect(config.model).toBe(DEFAULT_ASSISTANT_MODEL);
    if (!config.configured) expect(config.reason).toContain("ANTHROPIC_API_KEY");
  });
  it("modelo central com troca segura pela variável LEP_ASSISTANT_MODEL", () => {
    expect(
      resolveAssistantConfig({ ANTHROPIC_API_KEY: "k", LEP_ASSISTANT_MODEL: "claude-sonnet-5-5" })
        .model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveAssistantConfig({ ANTHROPIC_API_KEY: "k", LEP_ASSISTANT_MODEL: "gpt-x" }).model,
    ).toBe(DEFAULT_ASSISTANT_MODEL);
  });
  it("estima custo por tabela de preços (Opus 5.5: US$ 4 / 20 por milhão)", () => {
    expect(estimateCostUsd("claude-opus-5-5", { ...usage, cacheReadTokens: 10_000 })).toBe(0.008);
  });
});

describe("schema estrito", () => {
  it("objetos fecham propriedades extras e exigem todas as chaves", () => {
    const schema = s.object({ a: s.string(), b: s.nullable(s.integer()) });
    expect(schema).toMatchObject({ additionalProperties: false, required: ["a", "b"] });
  });
});

describe("runAgentStep", () => {
  const base = { system: "sys", tools: [], effort: "medium" as const, toolBudget: 10 };

  it("resposta final sem ferramentas", async () => {
    const model = fakeModel([{ text: "Pronto." }]);
    const result = await runAgentStep({
      ...base,
      model,
      transcript: [{ u: 1 }],
      executeTool: vi.fn(),
    });
    expect(result.outcome).toBe("final");
    expect(result.text).toBe("Pronto.");
    expect(result.transcript).toHaveLength(2);
  });

  it("executa as ferramentas e devolve TODOS os resultados num único bloco (append-only)", async () => {
    const model = fakeModel([
      {
        stopReason: "tool_use",
        toolCalls: [
          { id: "t1", name: "a", input: {} },
          { id: "t2", name: "b", input: {} },
        ],
      },
    ]);
    const executeTool = vi.fn(async (call) => ({
      toolUseId: call.id,
      content: "ok",
      isError: false,
    }));
    const before = [{ u: 1 }];
    const result = await runAgentStep({ ...base, model, transcript: before, executeTool });
    expect(result.outcome).toBe("continue");
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(result.transcript).toHaveLength(3);
    expect(before).toHaveLength(1); // a transcrição anterior não é alterada
    expect(result.transcript[2]).toMatchObject({
      results: [{ toolUseId: "t1" }, { toolUseId: "t2" }],
    });
  });

  it("ferramenta com erro vira resultado de erro estruturado (o modelo decide continuar)", async () => {
    const model = fakeModel([
      { stopReason: "tool_use", toolCalls: [{ id: "t1", name: "a", input: {} }] },
    ]);
    const result = await runAgentStep({
      ...base,
      model,
      transcript: [],
      executeTool: async () => {
        throw new Error("falha no banco");
      },
    });
    expect(result.toolResults[0]).toMatchObject({ isError: true });
    expect(result.toolResults[0]?.content).toContain("falha no banco");
  });

  it("recusa de segurança e saída truncada não executam ferramentas", async () => {
    const executeTool = vi.fn();
    const refused = await runAgentStep({
      ...base,
      model: fakeModel([{ stopReason: "refusal", toolCalls: [{ id: "t", name: "a", input: {} }] }]),
      transcript: [],
      executeTool,
    });
    expect(refused.outcome).toBe("refused");
    const truncated = await runAgentStep({
      ...base,
      model: fakeModel([
        { stopReason: "max_tokens", toolCalls: [{ id: "t", name: "a", input: {} }] },
      ]),
      transcript: [],
      executeTool,
    });
    expect(truncated.outcome).toBe("truncated");
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("respeita o limite de ferramentas da execução", async () => {
    const model = fakeModel([
      {
        stopReason: "tool_use",
        toolCalls: [
          { id: "t1", name: "a", input: {} },
          { id: "t2", name: "a", input: {} },
        ],
      },
    ]);
    const executeTool = vi.fn(async (call) => ({
      toolUseId: call.id,
      content: "ok",
      isError: false,
    }));
    const result = await runAgentStep({
      ...base,
      toolBudget: 1,
      model,
      transcript: [],
      executeTool,
    });
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("tool_budget_exhausted");
    expect(result.toolResults[1]).toMatchObject({ isError: true });
  });

  it("erro do modelo sobe classificado e não altera a transcrição", async () => {
    const model = fakeModel([]);
    model.runTurn = async () => {
      throw classifyAnthropicError(new Anthropic.APIConnectionTimeoutError());
    };
    const transcript = [{ u: 1 }];
    await expect(
      runAgentStep({ ...base, model, transcript, executeTool: vi.fn() }),
    ).rejects.toMatchObject({
      kind: "timeout",
      retryable: true,
    });
    expect(transcript).toHaveLength(1);
  });
});

describe("adaptador Anthropic", () => {
  it("envia ferramentas estritas, esforço, pensamento adaptativo, cache e fallback padrão", async () => {
    const create = vi.fn(async () => ({
      model: "claude-opus-5-5",
      stop_reason: "tool_use",
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "tool_use", id: "toolu_1", name: "consultar_edital", input: { secao: null } },
      ],
      usage: {
        input_tokens: 500,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 400,
      },
    }));
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    const model = createAnthropicAgentModel({ apiKey: "x", model: "claude-opus-5-5", client });
    const turn = await model.runTurn({
      system: "regras",
      tools: [
        {
          name: "consultar_edital",
          description: "d",
          inputSchema: s.object({ secao: s.nullable(s.string()) }),
          kind: "read",
        },
      ],
      transcript: [model.userMessage("oi")],
      effort: "high",
    });
    const params = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tool_choice: { type: "auto" },
      cache_control: { type: "ephemeral" },
    });
    expect((params.tools as { strict: boolean }[])[0]?.strict).toBe(true);
    expect(turn.toolCalls).toEqual([
      { id: "toolu_1", name: "consultar_edital", input: { secao: null } },
    ]);
    // A mensagem do assistente volta inteira (pensamento incluído), sem edição.
    expect(turn.assistantMessage).toMatchObject({
      role: "assistant",
      content: [{ type: "thinking" }, { type: "tool_use" }],
    });
    expect(turn.costUsd).toBeGreaterThan(0);
  });

  it("classifica erros da API sem comparar mensagens", () => {
    expect(
      classifyAnthropicError(new Anthropic.AuthenticationError(401, {}, "x", new Headers())).kind,
    ).toBe("auth");
    expect(
      classifyAnthropicError(new Anthropic.RateLimitError(429, {}, "x", new Headers())).retryable,
    ).toBe(true);
    expect(
      classifyAnthropicError(new Anthropic.BadRequestError(400, {}, "x", new Headers())).retryable,
    ).toBe(false);
  });
});
