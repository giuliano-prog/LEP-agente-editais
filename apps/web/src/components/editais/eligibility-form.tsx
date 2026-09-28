"use client";

import { useActionState } from "react";
import { ELIGIBILITY_LABELS, type EligibilityStatus } from "@lep/funding";
import { FormError, FormSuccess, Select, SubmitButton, TextArea } from "@/components/form";
import { setEditalEligibility, type EligibilityActionState } from "@/app/(app)/editais/actions";

/** Decisão da equipe sobre a elegibilidade (a varredura não sobrescreve). */
export function EligibilityForm({
  editalId,
  current,
  currentReason,
}: {
  editalId: string;
  current: EligibilityStatus;
  currentReason: string | null;
}) {
  const [state, action] = useActionState<EligibilityActionState, FormData>(
    setEditalEligibility.bind(null, editalId),
    {},
  );
  return (
    <form action={action} className="space-y-4">
      <Select
        label="Elegibilidade"
        name="eligibility_status"
        required
        options={ELIGIBILITY_LABELS}
        defaultValue={current}
      />
      <TextArea
        label="Motivo"
        name="eligibility_reason"
        required
        minLength={5}
        maxLength={1000}
        defaultValue={currentReason ?? ""}
        hint="Ex.: item do regulamento que confirma ou impede a participação da LEP."
      />
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Salvar elegibilidade</SubmitButton>
    </form>
  );
}
