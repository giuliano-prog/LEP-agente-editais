"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/form";

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, { error: initialError });
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormError message={state.error} />
      <SubmitButton>Entrar</SubmitButton>
    </form>
  );
}
