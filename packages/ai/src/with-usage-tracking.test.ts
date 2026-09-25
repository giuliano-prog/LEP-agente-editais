import { describe, expect, it } from "vitest";
import { withUsageTracking } from "./with-usage-tracking";
import type { AiProvider, AiUsageRecord } from "./types";

const request = {
  purpose: "test",
  model: "fake-model",
  messages: [{ role: "user" as const, content: "oi" }],
};

function makeRecorder() {
  const entries: AiUsageRecord[] = [];
  return { entries, recorder: { record: async (e: AiUsageRecord) => void entries.push(e) } };
}

describe("withUsageTracking", () => {
  it("registra custo e tokens em chamadas bem-sucedidas", async () => {
    const provider: AiProvider = {
      name: "fake",
      complete: async () => ({
        text: "olá",
        provider: "fake",
        model: "fake-model",
        usage: { inputTokens: 10, outputTokens: 5 },
        costUsd: 0.001,
        durationMs: 12,
      }),
    };
    const { entries, recorder } = makeRecorder();
    const tracked = withUsageTracking(provider, recorder, { orgId: "org-1" });

    await expect(tracked.complete(request)).resolves.toMatchObject({ text: "olá" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      status: "success",
      inputTokens: 10,
      costUsd: 0.001,
      orgId: "org-1",
    });
  });

  it("registra erros e repassa a exceção", async () => {
    const provider: AiProvider = {
      name: "fake",
      complete: async () => {
        throw new Error("falhou");
      },
    };
    const { entries, recorder } = makeRecorder();
    const tracked = withUsageTracking(provider, recorder, { orgId: "org-1" });

    await expect(tracked.complete(request)).rejects.toThrow("falhou");
    expect(entries[0]).toMatchObject({ status: "error", errorMessage: "falhou", costUsd: 0 });
  });
});
