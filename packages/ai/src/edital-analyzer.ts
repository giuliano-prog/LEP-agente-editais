/**
 * Interface única de análise de editais por IA (etapa 12) — SEM fornecedor definido.
 *
 * - `EditalAnalyzer` é o contrato; hoje o padrão é `NoopEditalAnalyzer` (nada é
 *   enviado a ninguém; as regras determinísticas continuam valendo).
 * - `createProviderEditalAnalyzer` adapta QUALQUER `AiProvider` (ADR-0006) quando a
 *   LEP escolher um fornecedor — sem SDK aqui.
 * - Toda resposta passa por `validateAnalysis`, que aplica as regras da LEP:
 *   · valor sem trecho que exista no texto do edital é descartado (sem alucinação);
 *   · nenhuma afirmação de aprovação ("será aprovado", "chance de aprovação"…);
 *   · "não elegível" nunca vem da IA: vira "necessita revisão" (decisão humana);
 *   · incerteza nunca vira "não elegível".
 * - Só textos do edital são enviados; dados de projetos da LEP nunca entram aqui.
 */
import type { AiProvider } from "./types";

export const ANALYSIS_FIELDS = [
  "deadline",
  "opensAt",
  "totalAmount",
  "maxAmountPerProject",
  "projectCount",
  "formats",
  "genres",
  "stages",
] as const;

export type AnalysisField = (typeof ANALYSIS_FIELDS)[number];

/** Mesmo vocabulário de elegibilidade de @lep/funding (sem "not_eligible": só decisão humana). */
export const AI_ELIGIBILITY = [
  "eligible",
  "not_confirmed",
  "territorial_restriction",
  "via_partner",
  "individual",
  "needs_review",
] as const;

export type AiEligibility = (typeof AI_ELIGIBILITY)[number];

export type AnalysisSource = { kind: "page" | "pdf"; label?: string; text: string };

export type EditalAnalysisInput = {
  title: string;
  sources: AnalysisSource[];
  /** Sede da proponente (a própria LEP; parceiras não contam). */
  proponent: { state: string | null; city: string | null };
};

export type AnalysisEvidence = { quote: string; source: "page" | "pdf" };

export type AnalyzedField = {
  value: unknown;
  evidence: AnalysisEvidence;
  confidence: "high" | "medium" | "low";
};

export type EditalAnalysis = {
  fields: Partial<Record<AnalysisField, AnalyzedField>>;
  eligibility: { status: AiEligibility; reason: string; evidence: AnalysisEvidence | null } | null;
  /** Resumo neutro do edital (sem juízo de chance de aprovação). */
  summary: string | null;
  /** O que foi descartado ou ajustado pelas regras de segurança, em pt-BR. */
  warnings: string[];
  analyzer: { name: string; provider: string | null; model: string | null };
};

export interface EditalAnalyzer {
  readonly name: string;
  /** false = sem fornecedor: a interface deve seguir só com as regras. */
  readonly enabled: boolean;
  analyze(input: EditalAnalysisInput): Promise<EditalAnalysis>;
}

const APPROVAL_CLAIM =
  /\b(ser[aá] aprovad|ser[aá] selecionad|ser[aá] contemplad|aprova[cç][aã]o (garantida|certa|prov[aá]vel)|chances? (de|alta|boa|grande)[^.]{0,30}(aprova|sele[cç]|ganhar|vencer)|vai (ganhar|vencer|ser aprovad)|garantid[oa] (a|o) (aprova|sele))/i;

const squash = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

function quoteExists(quote: string, sources: AnalysisSource[]): boolean {
  const needle = squash(quote);
  return needle.length >= 8 && sources.some((source) => squash(source.text).includes(needle));
}

function asEvidence(raw: unknown): AnalysisEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.quote !== "string") return null;
  return { quote: item.quote, source: item.source === "pdf" ? "pdf" : "page" };
}

/**
 * Aplica as regras da LEP a uma resposta bruta (de qualquer fornecedor).
 * Nunca lança: o que não passa vira aviso.
 */
export function validateAnalysis(
  raw: unknown,
  input: EditalAnalysisInput,
  analyzer: EditalAnalysis["analyzer"],
): EditalAnalysis {
  const warnings: string[] = [];
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fields: EditalAnalysis["fields"] = {};

  const rawFields = (data.fields && typeof data.fields === "object" ? data.fields : {}) as Record<
    string,
    unknown
  >;
  for (const [key, value] of Object.entries(rawFields)) {
    if (!(ANALYSIS_FIELDS as readonly string[]).includes(key)) {
      warnings.push(`Campo desconhecido ignorado: ${key}.`);
      continue;
    }
    const item = (value ?? {}) as Record<string, unknown>;
    const evidence = asEvidence(item.evidence);
    if (!evidence || !quoteExists(evidence.quote, input.sources)) {
      warnings.push(`${key}: descartado — o trecho citado não existe no texto do edital.`);
      continue;
    }
    fields[key as AnalysisField] = {
      value: item.value ?? null,
      evidence,
      confidence:
        item.confidence === "high" || item.confidence === "medium" ? item.confidence : "low",
    };
  }

  let eligibility: EditalAnalysis["eligibility"] = null;
  if (data.eligibility && typeof data.eligibility === "object") {
    const item = data.eligibility as Record<string, unknown>;
    let status = String(item.status ?? "");
    const reason = typeof item.reason === "string" ? item.reason.slice(0, 1000) : "";
    const evidence = asEvidence(item.evidence);
    if (status === "not_eligible") {
      warnings.push(
        'Elegibilidade: "não elegível" só por decisão da equipe — ajustado para "necessita revisão".',
      );
      status = "needs_review";
    }
    if (!(AI_ELIGIBILITY as readonly string[]).includes(status)) {
      warnings.push("Elegibilidade desconhecida: tratada como “não confirmada”.");
      status = "not_confirmed";
    }
    const verified = evidence && quoteExists(evidence.quote, input.sources) ? evidence : null;
    if (evidence && !verified) warnings.push("Elegibilidade: trecho citado não existe no texto.");
    // Restrição sem evidência verificável não é aceita: incerteza = não confirmada.
    if (!verified && status !== "not_confirmed") {
      warnings.push("Elegibilidade sem trecho verificável: tratada como “não confirmada”.");
      status = "not_confirmed";
    }
    eligibility = { status: status as AiEligibility, reason, evidence: verified };
  }

  let summary = typeof data.summary === "string" ? data.summary.slice(0, 2000) : null;
  const texts = [summary ?? "", eligibility?.reason ?? ""];
  if (texts.some((text) => APPROVAL_CLAIM.test(text))) {
    warnings.push("Afirmação sobre aprovação removida: a plataforma nunca prevê aprovação.");
    if (summary && APPROVAL_CLAIM.test(summary)) summary = null;
    if (eligibility && APPROVAL_CLAIM.test(eligibility.reason)) {
      eligibility = { ...eligibility, reason: "" };
    }
  }

  return { fields, eligibility, summary, warnings, analyzer };
}

/** Padrão atual: sem fornecedor de IA. Nada é enviado; a análise segue só pelas regras. */
export class NoopEditalAnalyzer implements EditalAnalyzer {
  readonly name = "sem-ia";
  readonly enabled = false;

  async analyze(): Promise<EditalAnalysis> {
    return {
      fields: {},
      eligibility: null,
      summary: null,
      warnings: [
        "Nenhum fornecedor de IA configurado: análise feita só pelas regras da plataforma.",
      ],
      analyzer: { name: this.name, provider: null, model: null },
    };
  }
}

const SYSTEM_PROMPT = `Você analisa editais de fomento ao audiovisual para a LEP Filmes (proponente sediada em São Paulo/SP).
Responda SOMENTE com JSON no formato:
{"fields": {"<campo>": {"value": ..., "evidence": {"quote": "<trecho LITERAL do texto>", "source": "page"|"pdf"}, "confidence": "high"|"medium"|"low"}},
 "eligibility": {"status": "eligible"|"not_confirmed"|"territorial_restriction"|"via_partner"|"individual"|"needs_review", "reason": "...", "evidence": {"quote": "...", "source": "..."}},
 "summary": "resumo neutro"}
Campos possíveis: ${ANALYSIS_FIELDS.join(", ")}. Datas AAAA-MM-DD; valores em reais como número.
Regras: cite trechos literais; se não houver trecho, omita o campo; nunca afirme ou estime chance de aprovação;
na dúvida sobre elegibilidade use "not_confirmed"; a proponente é sempre a própria LEP (parceiras não contam).`;

/** Extrai o primeiro objeto JSON de uma resposta de texto. */
function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Adaptador genérico: usa qualquer `AiProvider` (de preferência envolvido por
 * `withUsageTracking`, para registrar custo). O fornecedor será escolhido pela LEP.
 */
export function createProviderEditalAnalyzer(
  provider: AiProvider,
  { model = "capable", maxChars = 60_000 }: { model?: string; maxChars?: number } = {},
): EditalAnalyzer {
  return {
    name: `ia:${provider.name}`,
    enabled: true,
    async analyze(input) {
      const analyzer = { name: `ia:${provider.name}`, provider: provider.name, model };
      let budget = maxChars;
      const parts = input.sources.map((source) => {
        const text = source.text.slice(0, Math.max(0, budget));
        budget -= text.length;
        return `### ${source.kind === "pdf" ? "PDF" : "Página"}${source.label ? ` — ${source.label}` : ""}\n${text}`;
      });
      try {
        const response = await provider.complete({
          purpose: "editais.analyze",
          model,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Sede da proponente: ${input.proponent.city ?? "?"}/${input.proponent.state ?? "?"}.\nTítulo: ${input.title}\n\n${parts.join("\n\n")}`,
            },
          ],
          maxOutputTokens: 2000,
        });
        const parsed = parseJson(response.text);
        const result = validateAnalysis(parsed, input, { ...analyzer, model: response.model });
        if (parsed === null)
          result.warnings.unshift("Resposta da IA sem JSON válido: nada foi aproveitado.");
        return result;
      } catch {
        return {
          fields: {},
          eligibility: null,
          summary: null,
          warnings: ["Falha ao consultar o fornecedor de IA: análise feita só pelas regras."],
          analyzer,
        };
      }
    },
  };
}

/** Ponto único de escolha: sem fornecedor → Noop. */
export function getEditalAnalyzer(provider: AiProvider | null = null): EditalAnalyzer {
  return provider ? createProviderEditalAnalyzer(provider) : new NoopEditalAnalyzer();
}
