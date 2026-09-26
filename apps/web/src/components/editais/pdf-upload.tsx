"use client";

import { useState, useTransition } from "react";
import type { EditalActionState } from "@/app/(app)/editais/actions";
import { MAX_DOCUMENT_BYTES, uploadPath, DOCUMENTS_BUCKET } from "@/lib/editais/constants";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { ActionFeedback } from "./action-feedback";
import { KindSelect } from "./kind-select";

type UploadInput = { path: string; fileName: string; kind: string };

/**
 * Envio de PDF direto do navegador para o Storage privado (sem passar pelo
 * servidor do app), seguido do registro/validação pelo servidor.
 */
export function PdfUpload({
  orgId,
  action,
  submitLabel,
  withKind = false,
}: {
  orgId: string;
  action: (input: UploadInput) => Promise<EditalActionState>;
  submitLabel: string;
  withKind?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("annex");
  const [state, setState] = useState<EditalActionState>({});
  const [pending, startTransition] = useTransition();
  const [inputKey, setInputKey] = useState(0);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setState({ error: "Selecione um arquivo PDF." });
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return setState({ error: "Envie um arquivo PDF." });
    }
    if (file.size > MAX_DOCUMENT_BYTES)
      return setState({ error: "O arquivo excede o limite de 25 MB." });

    startTransition(async () => {
      setState({});
      const path = uploadPath(orgId, crypto.randomUUID());
      try {
        const { error } = await createBrowserSupabase()
          .storage.from(DOCUMENTS_BUCKET)
          .upload(path, file, { contentType: "application/pdf", upsert: false });
        if (error) throw error;
      } catch {
        setState({
          error:
            "Não foi possível enviar o arquivo. Verifique sua conexão e permissão e tente novamente.",
        });
        return;
      }
      const result = await action({ path, fileName: file.name, kind });
      setState(result ?? {});
      if (result?.success) {
        setFile(null);
        setInputKey((key) => key + 1);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Arquivo PDF</span>
        <input
          key={inputKey}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full cursor-pointer rounded-md border border-line bg-card-raised text-sm text-muted file:mr-3 file:cursor-pointer file:border-0 file:bg-brand/15 file:px-3 file:py-2 file:text-brand hover:file:bg-brand/25"
        />
        <span className="block text-xs text-muted">
          Até 25 MB. O arquivo original é guardado sem alterações.
        </span>
      </label>
      {withKind && <KindSelect defaultValue={kind} onChange={setKind} />}
      <ActionFeedback state={state} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Enviando e validando…" : submitLabel}
      </button>
    </form>
  );
}
