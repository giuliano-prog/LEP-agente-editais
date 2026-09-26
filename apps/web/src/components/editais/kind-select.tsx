import { DOCUMENT_KIND_LABELS } from "@lep/funding";
import { Select } from "@/components/form";

export function KindSelect({
  defaultValue = "annex",
  onChange,
}: {
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <Select
      label="Tipo de documento"
      name="kind"
      options={DOCUMENT_KIND_LABELS}
      defaultValue={defaultValue}
      required
      placeholder="Selecione o tipo…"
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
    />
  );
}
