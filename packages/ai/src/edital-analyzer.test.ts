import { describe, expect, it } from "vitest";
import {
  createProviderEditalAnalyzer,
  getEditalAnalyzer,
  NoopEditalAnalyzer,
  validateAnalysis,
  type EditalAnalysisInput,
} from "./edital-analyzer";
import { withUsageTracking } from "./with-usage-tracking";
import type { AiProvider, AiUsageRecord } from "./types";

const input: EditalAnalysisInput = {
  title: "Edital fictício de produção",
  sources: [
    {
      kind: "pdf",
      text: "Art. 5º As inscrições encerram-se em 30/11/2026. Somente produtoras sediadas no Município do Rio de Janeiro.",
    },
  ],
  proponent: { state: "SP", city: "São Paulo" },
};
const analyzer = { name: "teste", provider: "fake", model: "fake" };

/** Fornecedor fictício: devolve o texto combinado (nenhuma chamada real). */
const fakeProvider = (text: string): AiProvider => ({
  name: "fake",
  complete: async () => ({
    text,
    provider: "fake",
    model: "fake-1",
    usage: { inputTokens: 100, outputTokens: 50 },
    costUsd: 0.01,
    durationMs: 5,
  }),
});

describe("EditalAnalyzer — sem fornecedor definido", () => {
  it("padrão é o Noop: nada é enviado e a interface segue pelas regras", async () => {
    const noop = getEditalAnalyzer();
    expect(noop).toBeInstanceOf(NoopEditalAnalyzer);
    expect(noop.enabled).toBe(false);
    const result = await noop.analyze(input);
    expect(result).toMatchObject({ fields: {}, eligibility: null, summary: null });
    expect(result.warnings[0]).toContain("Nenhum fornecedor de IA configurado");
  });
});

describe("validateAnalysis — regras da LEP sobre qualquer resposta de IA", () => {
  it("aceita valor com trecho literal; descarta trecho inventado e campo desconhecido", () => {
    const result = validateAnalysis(
      {
        fields: {
          deadline: {
            value: "2026-11-30",
            evidence: { quote: "As inscrições encerram-se em 30/11/2026", source: "pdf" },
            confidence: "high",
          },
          totalAmount: { value: 1000000, evidence: { quote: "Valor total de R$ 1.000.000,00" } },
          chanceDeAprovacao: { value: 0.9 },
        },
      },
      input,
      analyzer,
    );
    expect(Object.keys(result.fields)).toEqual(["deadline"]);
    expect(result.warnings.join(" ")).toContain("totalAmount: descartado");
    expect(result.warnings.join(" ")).toContain("Campo desconhecido ignorado: chanceDeAprovacao");
  });

  it('"não elegível" nunca vem da IA: vira "necessita revisão"', () => {
    const result = validateAnalysis(
      {
        eligibility: {
          status: "not_eligible",
          reason: "Exige sede no Rio de Janeiro.",
          evidence: {
            quote: "Somente produtoras sediadas no Município do Rio de Janeiro",
            source: "pdf",
          },
        },
      },
      input,
      analyzer,
    );
    expect(result.eligibility?.status).toBe("needs_review");
  });

  it("restrição sem trecho verificável → não confirmada (incerteza não vira restrição)", () => {
    const result = validateAnalysis(
      {
        eligibility: {
          status: "territorial_restriction",
          reason: "x",
          evidence: { quote: "trecho que não existe no edital" },
        },
      },
      input,
      analyzer,
    );
    expect(result.eligibility?.status).toBe("not_confirmed");
  });

  it("remove qualquer afirmação sobre aprovação", () => {
    const result = validateAnalysis(
      { summary: "Edital nacional. O projeto tem grande chance de aprovação." },
      input,
      analyzer,
    );
    expect(result.summary).toBeNull();
    expect(result.warnings.join(" ")).toContain("nunca prevê aprovação");
  });

  it("resposta lixo não quebra", () => {
    expect(validateAnalysis("texto", input, analyzer)).toMatchObject({
      fields: {},
      eligibility: null,
    });
  });
});

describe("createProviderEditalAnalyzer — qualquer AiProvider, com registro de custo", () => {
  it("valida a resposta e registra uso via withUsageTracking", async () => {
    const entries: AiUsageRecord[] = [];
    const tracked = withUsageTracking(
      fakeProvider(
        'Segue: {"fields": {"deadline": {"value": "2026-11-30", "evidence": {"quote": "encerram-se em 30/11/2026", "source": "pdf"}, "confidence": "high"}}, "summary": "Edital de produção."}',
      ),
      { record: async (entry) => void entries.push(entry) },
      { orgId: "org-ficticia" },
    );
    const result = await createProviderEditalAnalyzer(tracked).analyze(input);
    expect(result.fields.deadline?.value).toBe("2026-11-30");
    expect(result.analyzer).toMatchObject({ provider: "fake", model: "fake-1" });
    expect(entries[0]).toMatchObject({ purpose: "editais.analyze", status: "success" });
  });

  it("JSON inválido ou falha do fornecedor → análise vazia com aviso", async () => {
    expect(
      (await createProviderEditalAnalyzer(fakeProvider("sem json")).analyze(input)).warnings[0],
    ).toContain("sem JSON válido");
    const failing: AiProvider = {
      name: "fake",
      complete: async () => {
        throw new Error("indisponível");
      },
    };
    expect((await createProviderEditalAnalyzer(failing).analyze(input)).warnings[0]).toContain(
      "Falha ao consultar",
    );
  });
});
