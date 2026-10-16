"use client";

import { useRef, useState, useTransition } from "react";
import {
  ORG_DOCUMENT_CATEGORIES,
  ORG_DOCUMENT_CATEGORY_LABELS,
  ORG_DOCUMENT_SCOPE_LABELS,
  ORG_DOCUMENT_SCOPES,
} from "@lep/funding";
import { createOrgDocument, type AcervoState } from "@/app/(app)/editais/acervo/actions";
import { FormError, FormSuccess } from "@/components/form";
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES } from "@/lib/editais/constants";
import { acervoPath } from "@/lib/editais/workspace-form";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { S } from "./styles";

/**
 * Cadastro no acervo: PDF opcional enviado direto do navegador ao bucket privado
 * (<org_id>/acervo/<uuid>.pdf), depois validado e registrado pelo servidor.
 */
export function AcervoUpload({
  orgId,
  productions,
}: {
  orgId: string;
  productions: { id: string; title: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [scope, setScope] = useState("company");
  const [state, setState] = useState<AcervoState>({});
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    form.delete("file");
    startTransition(async () => {
      setState({});
      if (file instanceof File && file.size > 0) {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
          return setState({ error: "Envie um arquivo PDF." });
        }
        if (file.size > MAX_DOCUMENT_BYTES) return setState({ error: "O arquivo excede 25 MB." });
        const path = acervoPath(orgId, crypto.randomUUID());
        const { error } = await createBrowserSupabase()
          .storage.from(DOCUMENTS_BUCKET)
          .upload(path, file, { contentType: "application/pdf", upsert: false });
        if (error) {
          return setState({
            error: "Não foi possível enviar o arquivo. Verifique a conexão e tente de novo.",
          });
        }
        form.set("file_path", path);
        form.set("file_name", file.name);
      }
      const result = await createOrgDocument(form);
      setState(result);
      if (result.success) {
        formRef.current?.reset();
        setScope("company");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${S.label} sm:col-span-2`}>
          <span className="font-medium">Nome do documento</span>
          <input
            name="title"
            required
            minLength={2}
            maxLength={200}
            placeholder="Ex.: Certidão negativa de débitos federais"
            className={S.control}
          />
        </label>
        <label className={S.label}>
          <span className="font-medium">De quem é</span>
          <select
            name="scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className={S.control}
          >
            {ORG_DOCUMENT_SCOPES.map((value) => (
              <option key={value} value={value}>
                {ORG_DOCUMENT_SCOPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {scope === "production" ? (
          <label className={S.label}>
            <span className="font-medium">Produção</span>
            <select name="projeto_id" required className={S.control} defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {productions.map((production) => (
                <option key={production.id} value={production.id}>
                  {production.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="hidden sm:block" />
        )}
        <label className={S.label}>
          <span className="font-medium">Categoria</span>
          <select name="category" className={S.control} defaultValue="fiscal">
            {ORG_DOCUMENT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {ORG_DOCUMENT_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className={S.label}>
          <span className="font-medium">Válido até (opcional)</span>
          <input type="date" name="valid_until" className={S.control} />
          <span className="block text-xs text-muted">
            Certidões: a plataforma avisa se vencer antes do prazo do edital.
          </span>
        </label>
        <label className={S.label}>
          <span className="font-medium">PDF (opcional)</span>
          <input
            type="file"
            name="file"
            accept="application/pdf,.pdf"
            className="block w-full cursor-pointer rounded-lg border border-line bg-card-raised text-sm text-muted file:mr-3 file:cursor-pointer file:border-0 file:bg-brand/15 file:px-3 file:py-2 file:text-brand hover:file:bg-brand/25"
          />
        </label>
        <label className={S.label}>
          <span className="font-medium">Link (opcional)</span>
          <input type="url" name="external_url" placeholder="https://…" className={S.control} />
        </label>
        <label className={`${S.label} sm:col-span-2`}>
          <span className="font-medium">Observação (onde está, quem emite…)</span>
          <input name="notes" maxLength={2000} className={S.control} />
        </label>
      </div>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <button type="submit" disabled={pending} className={`${S.primary} w-full sm:w-auto`}>
        {pending ? "Enviando…" : "Cadastrar no acervo"}
      </button>
    </form>
  );
}
