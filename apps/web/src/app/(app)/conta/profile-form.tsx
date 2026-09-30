"use client";

import { useActionState } from "react";
import { AvatarField } from "@/components/avatar-field";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/form";
import { updateMyProfile, type ProfileFormState } from "./actions";

export function ProfileForm({
  fullName,
  avatarUrl,
}: {
  fullName: string | null;
  avatarUrl: string | null;
}) {
  const [state, action] = useActionState<ProfileFormState, FormData>(updateMyProfile, {});
  return (
    <form key={state.savedAt ?? "perfil"} action={action} className="space-y-4">
      <Field
        label="Nome"
        name="full_name"
        required
        minLength={2}
        maxLength={120}
        defaultValue={fullName ?? ""}
        autoComplete="name"
      />
      <AvatarField name={fullName} currentUrl={avatarUrl} allowRemove />
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Salvar dados</SubmitButton>
    </form>
  );
}
