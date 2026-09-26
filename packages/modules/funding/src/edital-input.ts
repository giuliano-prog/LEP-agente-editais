import { z } from "zod";
import { PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { EDITAL_STATUS_LABELS } from "./edital";

/** Tipos de documento de um edital (core.edital_documents.kind). */
export const DOCUMENT_KIND_LABELS = {
  main: "Edital (documento principal)",
  annex: "Anexo",
  rectification: "Retificação / alteração",
  faq: "Perguntas e respostas",
  result: "Resultado",
  other: "Outro",
} as const;

export type DocumentKindCode = keyof typeof DOCUMENT_KIND_LABELS;

/** "R$ 1.500.000,50" | "1500000.50" | "1.500.000" → número. Vazio → null. */
export function parseMoney(raw: unknown): number | null | typeof Number.NaN {
  if (raw === null || raw === undefined) return null;
  const text = String(raw)
    .replace(/R\$|\s/g, "")
    .trim();
  if (text === "") return null;
  let normalized = text;
  if (text.includes(",")) normalized = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) normalized = text.replace(/\./g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Texto com um item por linha → lista sem vazios/duplicados. */
export function parseLines(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const items = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  return [...new Set(items)].slice(0, 100);
}

/** Data (AAAA-MM-DD) + hora opcional (HH:MM) no horário de Brasília → ISO com fuso. */
export function toDeadlineIso(date: unknown, time: unknown): string | null {
  if (typeof date !== "string" || date === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "invalid";
  const hour = typeof time === "string" && /^\d{2}:\d{2}$/.test(time) ? time : "23:59";
  return `${date}T${hour}:00-03:00`;
}

const money = (label: string) =>
  z
    .unknown()
    .transform(parseMoney)
    .refine((value) => value === null || (!Number.isNaN(value) && value >= 0 && value <= 1e12), {
      message: `${label}: informe um valor válido (ex.: 1.500.000,00).`,
    }) as z.ZodType<number | null>;

const codes = <T extends Record<string, string>>(vocabulary: T) =>
  z.array(z.string()).transform((values) => values.filter((value) => value in vocabulary));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

export const editalInputSchema = z
  .object({
    title: z.string().trim().min(3, "Informe o título do edital.").max(300),
    agency: optionalText(200),
    status: z
      .string()
      .optional()
      .transform((value) => (value && value in EDITAL_STATUS_LABELS ? value : null)),
    deadline: z
      .string()
      .nullable()
      .refine((value) => value !== "invalid", { message: "Data do prazo inválida." }),
    total_amount: money("Valor total"),
    max_amount_per_project: money("Valor máximo por projeto"),
    min_budget: money("Orçamento mínimo"),
    max_budget: money("Orçamento máximo"),
    summary: optionalText(10000),
    eligibility_criteria: z.array(z.string()),
    categories: z.array(z.string()),
    required_documents: z.array(z.string()),
    official_url: optionalText(2000).refine(
      (value) => value === null || /^https?:\/\//i.test(value),
      {
        message: "Link oficial deve começar com http:// ou https://.",
      },
    ),
    accepted_formats: codes(PROJECT_FORMATS),
    accepted_genres: codes(PROJECT_GENRES),
    accepted_stages: codes(PROJECT_STAGES),
    reviewed: z.boolean(),
  })
  .refine(
    (data) =>
      data.min_budget === null || data.max_budget === null || data.min_budget <= data.max_budget,
    {
      message: "O orçamento mínimo não pode ser maior que o máximo.",
    },
  )
  .transform(({ reviewed, ...data }) => ({
    ...data,
    // Revisão humana explícita (ADR-0009): só vira "validated" quando alguém confirma.
    review_status: reviewed ? ("validated" as const) : ("pending" as const),
  }));

export type EditalInput = z.infer<typeof editalInputSchema>;

/** Converte o FormData do formulário de edital no objeto validado pelo schema. */
export function editalFormToInput(form: FormData) {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };
  return {
    title: text("title") ?? "",
    agency: text("agency"),
    status: text("status"),
    deadline: toDeadlineIso(text("deadline_date"), text("deadline_time")),
    total_amount: text("total_amount"),
    max_amount_per_project: text("max_amount_per_project"),
    min_budget: text("min_budget"),
    max_budget: text("max_budget"),
    summary: text("summary"),
    eligibility_criteria: parseLines(text("eligibility_criteria")),
    categories: parseLines(text("categories")),
    required_documents: parseLines(text("required_documents")),
    official_url: text("official_url"),
    accepted_formats: form.getAll("accepted_formats").map(String),
    accepted_genres: form.getAll("accepted_genres").map(String),
    accepted_stages: form.getAll("accepted_stages").map(String),
    reviewed: form.get("reviewed") === "on",
  };
}
