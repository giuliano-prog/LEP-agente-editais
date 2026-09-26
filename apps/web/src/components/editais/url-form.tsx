"use client";

import { useActionState } from "react";
import type { EditalActionState } from "@/app/(app)/editais/actions";
import { Field, SubmitButton } from "@/components/form";
import { ActionFeedback } from "./action-feedback";
import { KindSelect } from "./kind-select";

type Action = (state: EditalActionState, formData: FormData) => Promise<EditalActionState>;

export function UrlForm({
  action,
  submitLabel,
  withKind = false,
}: {
  action: Action;
  submitLabel: string;
  withKind?: boolean;
}) {
  const [state, formAction] = useActionState<EditalActionState, FormData>(action, {});
  return (
    <form key={state.savedAt ?? "url"} action={formAction} className="space-y-4">
      <Field
        label="Link (página oficial ou PDF)"
        name="url"
        type="url"
        required
        placeholder="https://…"
        hint="A plataforma guarda uma cópia do conteúdo. Sites que exigem login não são acessados."
      />
      {withKind && <KindSelect />}
      <ActionFeedback state={state} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
