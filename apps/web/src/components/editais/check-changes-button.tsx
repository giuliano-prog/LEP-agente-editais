"use client";

import { useActionState } from "react";
import { checkChangesNow, type ChangeCheckState } from "@/app/(app)/editais/actions";

/** Baixa de novo a página oficial e compara (mesma verificação da varredura). */
export function CheckChangesButton({ editalId }: { editalId: string }) {
  const [state, action, pending] = useActionState<ChangeCheckState>(
    checkChangesNow.bind(null, editalId),
    {},
  );
  return (
    <form action={action} className="space-y-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-brand hover:text-brand disabled:opacity-60"
      >
        {pending ? "Verificando…" : "Verificar alterações agora"}
      </button>
      {state.error && (
        <p role="alert" className="max-w-xs text-xs text-bad">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="max-w-xs text-xs text-ok">
          {state.success}
        </p>
      )}
    </form>
  );
}
