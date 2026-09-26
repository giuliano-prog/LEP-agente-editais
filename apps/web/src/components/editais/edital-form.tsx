"use client";

import { useActionState } from "react";
import { EDITAL_STATUS_LABELS } from "@lep/funding";
import { PROJECT_FORMATS, PROJECT_GENRES, PROJECT_STAGES } from "@lep/projects";
import type { EditalActionState } from "@/app/(app)/editais/actions";
import { Field, FormError, Select, SubmitButton, TextArea } from "@/components/form";

export type EditalFormDefaults = {
  title: string;
  agency: string;
  status: string;
  deadlineDate: string;
  deadlineTime: string;
  totalAmount: string;
  maxAmountPerProject: string;
  minBudget: string;
  maxBudget: string;
  summary: string;
  eligibilityCriteria: string;
  categories: string;
  requiredDocuments: string;
  officialUrl: string;
  acceptedFormats: string[];
  acceptedGenres: string[];
  acceptedStages: string[];
  eligibleTerritories: string[];
  reviewed: boolean;
};

type Action = (state: EditalActionState, formData: FormData) => Promise<EditalActionState>;

/** Atalhos de território (diretriz nº 1: LEP sediada em São Paulo/SP). */
const TERRITORY_PRESETS: Record<string, string> = {
  BR: "Todo o Brasil",
  SP: "Estado de São Paulo",
  "SP:São Paulo": "Município de São Paulo",
};

function Fieldset({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-line bg-card p-6">
      <legend className="px-1 text-sm font-semibold uppercase tracking-wider text-muted">
        {legend}
      </legend>
      {description && <p className="-mt-2 text-sm text-muted">{description}</p>}
      {children}
    </fieldset>
  );
}

function CheckboxGroup({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: Record<string, string>;
  selected: string[];
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([value, text]) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-card-raised px-3 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:text-brand"
          >
            <input
              type="checkbox"
              name={name}
              value={value}
              defaultChecked={selected.includes(value)}
              className="accent-brand"
            />
            {text}
          </label>
        ))}
      </div>
    </div>
  );
}

export function EditalForm({ action, defaults }: { action: Action; defaults: EditalFormDefaults }) {
  const [state, formAction] = useActionState<EditalActionState, FormData>(action, {});
  const money = { inputMode: "decimal" as const, placeholder: "Ex.: 1.500.000,00" };

  return (
    <form action={formAction} className="space-y-6">
      <Fieldset legend="Identificação">
        <Field
          label="Título"
          name="title"
          required
          minLength={3}
          maxLength={300}
          defaultValue={defaults.title}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Órgão / instituição"
            name="agency"
            maxLength={200}
            defaultValue={defaults.agency}
          />
          <Select
            label="Status"
            name="status"
            options={EDITAL_STATUS_LABELS}
            defaultValue={defaults.status}
            placeholder="Não informado"
          />
        </div>
        <Field
          label="Link oficial"
          name="official_url"
          type="url"
          placeholder="https://…"
          defaultValue={defaults.officialUrl}
        />
      </Fieldset>

      <Fieldset
        legend="Prazo e valores"
        description="Horário de Brasília. Sem hora informada, o prazo vale até 23h59."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Prazo final — data"
            name="deadline_date"
            type="date"
            defaultValue={defaults.deadlineDate}
          />
          <Field
            label="Prazo final — hora"
            name="deadline_time"
            type="time"
            defaultValue={defaults.deadlineTime}
          />
          <Field
            label="Valor total (R$)"
            name="total_amount"
            defaultValue={defaults.totalAmount}
            {...money}
          />
          <Field
            label="Valor máximo por projeto (R$)"
            name="max_amount_per_project"
            defaultValue={defaults.maxAmountPerProject}
            {...money}
          />
        </div>
      </Fieldset>

      <Fieldset legend="Conteúdo" description="Listas: um item por linha.">
        <TextArea label="Resumo" name="summary" maxLength={10000} defaultValue={defaults.summary} />
        <TextArea
          label="Critérios de elegibilidade"
          name="eligibility_criteria"
          defaultValue={defaults.eligibilityCriteria}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea
            label="Categorias / modalidades"
            name="categories"
            defaultValue={defaults.categories}
          />
          <TextArea
            label="Documentos exigidos"
            name="required_documents"
            defaultValue={defaults.requiredDocuments}
          />
        </div>
      </Fieldset>

      <Fieldset
        legend="Regras usadas no Match"
        description="Deixe em branco o que o edital não restringe. Campos em branco viram “pontos de atenção” no Match."
      >
        <CheckboxGroup
          label="Território de sede aceito para o proponente"
          name="eligible_territories"
          options={TERRITORY_PRESETS}
          selected={defaults.eligibleTerritories}
        />
        <TextArea
          label="Outros territórios aceitos (um por linha)"
          name="other_territories"
          placeholder={"RJ\nRJ:Rio de Janeiro"}
          hint="Sigla do estado (ex.: RJ) ou UF:Município. Se o edital for exclusivo de outro local, a aderência fica “Baixa”: a LEP é sediada em São Paulo/SP."
          defaultValue={defaults.eligibleTerritories
            .filter((code) => !(code in TERRITORY_PRESETS))
            .join("\n")}
        />
        <CheckboxGroup
          label="Formatos aceitos"
          name="accepted_formats"
          options={PROJECT_FORMATS}
          selected={defaults.acceptedFormats}
        />
        <CheckboxGroup
          label="Gêneros / tipologias aceitos"
          name="accepted_genres"
          options={PROJECT_GENRES}
          selected={defaults.acceptedGenres}
        />
        <CheckboxGroup
          label="Estágios aceitos"
          name="accepted_stages"
          options={PROJECT_STAGES}
          selected={defaults.acceptedStages}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Orçamento mínimo do projeto (R$)"
            name="min_budget"
            defaultValue={defaults.minBudget}
            {...money}
          />
          <Field
            label="Orçamento máximo do projeto (R$)"
            name="max_budget"
            defaultValue={defaults.maxBudget}
            {...money}
          />
        </div>
      </Fieldset>

      <div className="space-y-4 rounded-xl border border-brand/40 bg-brand/5 p-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="reviewed"
            defaultChecked={defaults.reviewed}
            className="mt-1 accent-brand"
          />
          <span className="text-sm">
            <span className="font-medium">Revisei estas informações com o documento oficial.</span>
            <span className="block text-muted">
              Somente editais revisados são considerados validados. Sem esta confirmação, o Match é
              exibido como preliminar.
            </span>
          </span>
        </label>
        <FormError message={state.error} />
        <SubmitButton>Salvar edital</SubmitButton>
      </div>
    </form>
  );
}
