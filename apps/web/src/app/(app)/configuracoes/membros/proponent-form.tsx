"use client";

import { useActionState } from "react";
import { UF_NAMES } from "@lep/funding";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/form";
import { updateProponent, type ProponentState } from "./actions";

export function ProponentForm({ state, city }: { state: string | null; city: string | null }) {
  const [result, action] = useActionState<ProponentState, FormData>(updateProponent, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
      <Select
        label="UF da sede"
        name="hq_state"
        options={UF_NAMES}
        defaultValue={state ?? ""}
        required
      />
      <Field
        label="Município da sede"
        name="hq_city"
        defaultValue={city ?? ""}
        required
        maxLength={120}
      />
      <SubmitButton>Salvar</SubmitButton>
      <div className="sm:col-span-3">
        <FormError message={result.error} />
        <FormSuccess message={result.success} />
      </div>
    </form>
  );
}
