import type { AiProvider, AiRequest, AiResponse, AiUsageRecorder } from "./types";

/**
 * Envolve um provedor para que TODA chamada (sucesso ou erro) seja registrada.
 * Assim o controle de custos independe do fornecedor escolhido.
 */
export function withUsageTracking(
  provider: AiProvider,
  recorder: AiUsageRecorder,
  context: { orgId: string; metadata?: Record<string, unknown> },
): AiProvider {
  return {
    name: provider.name,
    async complete(request: AiRequest): Promise<AiResponse> {
      const startedAt = Date.now();
      try {
        const response = await provider.complete(request);
        await recorder.record({
          orgId: context.orgId,
          purpose: request.purpose,
          provider: response.provider,
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cachedInputTokens: response.usage.cachedInputTokens ?? 0,
          costUsd: response.costUsd,
          durationMs: response.durationMs,
          status: "success",
          metadata: context.metadata,
        });
        return response;
      } catch (error) {
        await recorder.record({
          orgId: context.orgId,
          purpose: request.purpose,
          provider: provider.name,
          model: request.model,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          costUsd: 0,
          durationMs: Date.now() - startedAt,
          status: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
          metadata: context.metadata,
        });
        throw error;
      }
    },
  };
}
