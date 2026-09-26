"use client";

import { useActionState } from "react";
import { addDocumentFromUrl, type EditalActionState } from "@/app/(app)/editais/actions";

/** Adiciona como anexo um PDF encontrado na página oficial. */
export function AddFoundPdfButton({ editalId, url }: { editalId: string; url: string }) {
  const [state, action, pending] = useActionState<EditalActionState, FormData>(
    addDocumentFromUrl.bind(null, editalId),
    {},
  );
  if (state.success) return <span className="text-xs text-ok">✓ Adicionado</span>;
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="url" value={url} />
      <input type="hidden" name="kind" value="annex" />
      {state.error && <span className="text-xs text-bad">{state.error}</span>}
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-md border border-line px-3 py-1 text-xs hover:border-brand hover:text-brand disabled:opacity-60"
      >
        {pending ? "Adicionando…" : "Adicionar como anexo"}
      </button>
    </form>
  );
}
