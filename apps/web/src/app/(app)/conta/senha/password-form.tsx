"use client";

import { useActionState } from "react";
import { updatePassword, type FormState } from "@/lib/auth/actions";
import { Field, FormError, SubmitButton } from "@/components/form";

export function PasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="space-y-4">
      <Field
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
      />
      <Field
        label="Confirme a nova senha"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
      />
      <p className="text-xs text-muted">
        Mínimo de 10 caracteres, com letras maiúsculas, minúsculas e números.
      </p>
      <FormError message={state.error} />
      <SubmitButton>Salvar senha</SubmitButton>
    </form>
  );
}
