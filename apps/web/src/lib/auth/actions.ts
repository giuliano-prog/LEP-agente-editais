"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { passwordSchema } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string };

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Informe um e-mail e uma senha válidos." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Mensagem genérica: não revela se o e-mail existe.
  if (error) return { error: "E-mail ou senha incorretos." };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const updatePasswordSchema = z
  .object({ password: passwordSchema, confirmation: z.string() })
  .refine((data) => data.password === data.confirmation, {
    message: "As senhas não conferem.",
  });

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Senha inválida." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível atualizar a senha. Tente novamente." };

  redirect("/?senha=atualizada");
}
