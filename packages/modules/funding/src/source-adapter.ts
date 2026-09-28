/**
 * Configuração de adaptador por fonte (core.edital_sources.adapter_config).
 *
 * Só regras simples e testáveis sobre endereços e títulos de links — nada de
 * seletores CSS/XPath frágeis. Valores inválidos no banco não quebram a varredura:
 * voltam ao padrão, com aviso.
 */
import { z } from "zod";

const fragment = z
  .string({ message: "Use texto." })
  .trim()
  .min(2, "cada trecho precisa de ao menos 2 caracteres")
  .max(200, "cada trecho pode ter até 200 caracteres");
const list = z
  .array(fragment, { message: "Use uma lista de trechos." })
  .max(30, "no máximo 30 trechos");

export const sourceAdapterSchema = z
  .object({
    /** Ignora links cujo endereço contém um destes trechos (ex.: "/resultado", "/noticias/"). */
    linkExcludes: list.default([]),
    /** Ignora links cujo texto contém um destes trechos (sem diferenciar maiúsculas/acentos). */
    titleExcludes: list.default([]),
    /** Máximo de oportunidades novas importadas por execução. */
    maxImports: z
      .number({ message: "Use um número." })
      .int("Use um número inteiro.")
      .min(1, "mínimo 1")
      .max(10, "máximo 10")
      .default(5),
    /** Classifica cada página antes de importar (desligar só para fontes já filtradas). */
    classifyPages: z.boolean({ message: "Use verdadeiro ou falso." }).default(true),
    /** Aceita links diretos para PDF (inclusive de outros domínios). */
    allowPdfLinks: z.boolean({ message: "Use verdadeiro ou falso." }).default(true),
  })
  .strict();

export type SourceAdapter = z.infer<typeof sourceAdapterSchema>;

export const DEFAULT_SOURCE_ADAPTER: SourceAdapter = sourceAdapterSchema.parse({});

/** Lê a configuração gravada; inválida → padrão + aviso (a varredura nunca para por isso). */
export function parseSourceAdapter(raw: unknown): {
  adapter: SourceAdapter;
  warning: string | null;
} {
  const parsed = sourceAdapterSchema.safeParse(raw ?? {});
  if (parsed.success) return { adapter: parsed.data, warning: null };
  const issue = parsed.error.issues[0];
  const detail =
    issue?.code === "unrecognized_keys"
      ? `opções desconhecidas: ${issue.keys.join(", ")} (seletores CSS não são aceitos)`
      : `${issue?.path.join(".") || "adapter_config"}: ${issue?.message}`;
  return {
    adapter: DEFAULT_SOURCE_ADAPTER,
    warning: `Configuração da fonte inválida (${detail}); usando o padrão.`,
  };
}

/** Uma entrada por linha (formulários). */
export function linesToList(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
