"use client";

import { useActionState } from "react";
import { PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import { Field, FormError, FormSuccess, Select, SubmitButton, TextArea } from "@/components/form";
import { createProject, type ProjectFormState } from "./actions";

export function ProjectForm() {
  const [state, action] = useActionState<ProjectFormState, FormData>(createProject, {});
  return (
    // `key` muda a cada cadastro bem-sucedido → o formulário é limpo.
    <form key={state.savedAt ?? "new"} action={action} className="space-y-4">
      <Field
        label="Título"
        name="title"
        required
        minLength={2}
        maxLength={200}
        placeholder="Título do projeto"
      />
      <div className="grid gap-4">
        <Select label="Formato" name="format" options={PROJECT_FORMATS} required />
        <Select label="Gênero / tipologia" name="genre" options={PROJECT_GENRES} required />
        <Select label="Estágio" name="stage" options={PROJECT_STAGES} required />
      </div>
      <Field
        label="Orçamento total (R$)"
        name="budget"
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        placeholder="Ex.: 2500000"
        hint="Opcional, mas necessário para comparar com a faixa de orçamento dos editais."
      />
      <TextArea label="Sinopse" name="synopsis" maxLength={5000} placeholder="Resumo do projeto" />
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Cadastrar projeto</SubmitButton>
    </form>
  );
}
