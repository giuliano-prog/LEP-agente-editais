"use client";

import { useState, useTransition } from "react";
import { openOrgDocument } from "@/app/(app)/editais/acervo/actions";

/** Abre o PDF do acervo por um link temporário (bucket privado). */
export function OpenDocument({
  documentId,
  label = "Abrir PDF",
}: {
  documentId: string;
  label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await openOrgDocument(documentId);
            if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
            else setError(result.error ?? "Não foi possível abrir.");
          })
        }
        className="text-xs text-brand hover:underline disabled:opacity-60"
      >
        {pending ? "Abrindo…" : label}
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}
