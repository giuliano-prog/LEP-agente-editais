import { z } from "zod";
import { keysOf, PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "./vocabulary";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

/** Validação do cadastro de projeto (usada no formulário e na ação do servidor). */
export const projectInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Informe o título (mínimo de 2 caracteres).")
    .max(200, "Título muito longo."),
  format: z.enum(keysOf(PROJECT_FORMATS), { error: "Selecione o formato." }),
  genre: z.enum(keysOf(PROJECT_GENRES), { error: "Selecione o gênero." }),
  stage: z.enum(keysOf(PROJECT_STAGES), { error: "Selecione o estágio." }),
  budget: z
    .union([z.literal(""), z.coerce.number()])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value))
    .refine((value) => value === null || (Number.isFinite(value) && value >= 0), {
      message: "Orçamento deve ser um valor positivo.",
    })
    .refine((value) => value === null || value <= 1_000_000_000_000, {
      message: "Orçamento acima do limite permitido.",
    }),
  synopsis: optionalText(5000),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;

export type Project = ProjectInput & {
  id: string;
  created_at: string;
};
