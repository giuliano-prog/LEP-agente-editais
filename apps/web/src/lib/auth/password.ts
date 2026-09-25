import { z } from "zod";

/** Mesma política configurada no Supabase Auth (supabase/config.toml). */
export const passwordSchema = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .regex(/[a-z]/, "Inclua ao menos uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua ao menos uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua ao menos um número.");
