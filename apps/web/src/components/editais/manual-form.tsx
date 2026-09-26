"use client";

import { useActionState } from "react";
import { createEditalManual, type EditalActionState } from "@/app/(app)/editais/actions";
import { Field, FormError, SubmitButton } from "@/components/form";

export function ManualForm() {
  const [state, action] = useActionState<EditalActionState, FormData>(createEditalManual, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Título do edital" name="title" required minLength={3} maxLength={300} />
      <FormError message={state.error} />
      <SubmitButton>Criar e preencher</SubmitButton>
    </form>
  );
}
