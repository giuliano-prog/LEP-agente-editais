import { z } from "zod";

/**
 * Formato de um caso do benchmark de editais.
 * `expected` lista só o que foi conferido por uma pessoa; campos ausentes não são avaliados.
 */
export const benchmarkCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/, "id: letras minúsculas, números e hífens"),
  /** true = caso inventado (exemplo). Casos reais ficam fora do repositório (ver README). */
  fictitious: z.boolean(),
  /** De onde veio o caso (ex.: "planilha 26/09/2026, linha 12"). */
  origin: z.string().min(1),
  /** Data usada como "hoje" para situação/prazo (resultado reprodutível). */
  referenceDate: z.iso.date(),
  input: z.object({
    title: z.string().min(1),
    url: z.url(),
    agency: z.string().optional(),
    /** A fonte publica só audiovisual (ex.: Spcine, RioFilme). */
    audiovisualSource: z.boolean().default(false),
    /** Texto da página (HTML já convertido em texto). */
    text: z.string().default(""),
    /** Texto do regulamento em PDF, quando houver. */
    pdfText: z.string().optional(),
  }),
  expected: z
    .object({
      /** É uma oportunidade (edital/chamada/prêmio) e não página genérica/resultado. */
      isOpportunity: z.boolean().optional(),
      /** Tipo da página (classificador da etapa 6). */
      pageType: z
        .enum([
          "opportunity",
          "uncertain",
          "listing",
          "result",
          "rectification",
          "news",
          "institutional",
        ])
        .optional(),
      /** Elegibilidade territorial da LEP (São Paulo/SP). */
      territory: z.enum(["eligible", "ineligible", "unknown"]).optional(),
      /** Elegibilidade geral (taxonomia da etapa 5). */
      eligibility: z
        .enum([
          "eligible",
          "not_eligible",
          "not_confirmed",
          "territorial_restriction",
          "via_partner",
          "individual",
          "needs_review",
        ])
        .optional(),
      /** Prazo final de inscrição (AAAA-MM-DD). */
      deadline: z.iso.date().nullable().optional(),
      totalAmount: z.number().nonnegative().nullable().optional(),
      status: z.enum(["open", "closed", "upcoming"]).nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, "expected: informe ao menos um campo"),
  notes: z.string().optional(),
});

export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type ExpectedField = keyof BenchmarkCase["expected"];
