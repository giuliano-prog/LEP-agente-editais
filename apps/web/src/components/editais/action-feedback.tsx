import Link from "next/link";
import type { EditalActionState } from "@/app/(app)/editais/actions";
import { FormError, FormSuccess } from "@/components/form";

/** Mensagens de erro/sucesso das ações de edital, com link para o edital duplicado. */
export function ActionFeedback({ state }: { state: EditalActionState }) {
  return (
    <>
      <FormError message={state.error} />
      {state.duplicate && (
        <p className="text-sm text-muted">
          Já cadastrado em:{" "}
          <Link
            href={`/editais/${state.duplicate.editalId}`}
            className="text-brand hover:underline"
          >
            {state.duplicate.title}
          </Link>
        </p>
      )}
      <FormSuccess message={state.success} />
    </>
  );
}
