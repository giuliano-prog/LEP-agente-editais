"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/form";
import { createSource, runMonitorNow, type SourceActionState } from "./actions";

export function SourceForm() {
  const [state, action] = useActionState<SourceActionState, FormData>(createSource, {});
  return (
    <form key={state.savedAt ?? "source"} action={action} className="space-y-4">
      <Field
        label="Nome"
        name="name"
        required
        maxLength={120}
        placeholder="Ex.: Spcine — Editais"
      />
      <Field label="Instituição" name="agency" maxLength={200} placeholder="Ex.: Spcine" />
      <Field
        label="Página de listagem de editais"
        name="list_url"
        type="url"
        required
        placeholder="https://…"
        hint="Página pública onde o órgão lista os editais. Sites com login não são acessados."
      />
      <Field
        label="Filtro de endereço (opcional)"
        name="link_contains"
        maxLength={200}
        placeholder="/editais/"
        hint="Só considera links cujo endereço contém este trecho."
      />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="audiovisual_only"
          defaultChecked
          className="mt-1 accent-brand"
        />
        <span>
          Fonte exclusiva de audiovisual
          <span className="block text-xs text-muted">
            Desmarque para fontes gerais de cultura: aí só entram links com termos de audiovisual.
          </span>
        </span>
      </label>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Cadastrar fonte</SubmitButton>
    </form>
  );
}

export function RunNowButton() {
  const [state, action, pending] = useActionState<SourceActionState>(runMonitorNow, {});
  return (
    <form action={action} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Verificando fontes… (até 1 min)" : "Verificar agora"}
      </button>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
    </form>
  );
}
