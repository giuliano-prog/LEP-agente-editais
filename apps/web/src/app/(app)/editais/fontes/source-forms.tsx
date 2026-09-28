"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess, SubmitButton, TextArea } from "@/components/form";
import type { MonitorSummary } from "@/lib/monitor/summary";
import type { SourceAdapter } from "@lep/funding";
import { createSource, runMonitorNow, updateSourceConfig, type SourceActionState } from "./actions";

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
    <form action={action} className="space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Verificando fontes… (até 1 min)" : "Verificar agora"}
      </button>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      {state.summary && <RunSummary summary={state.summary} />}
    </form>
  );
}

const COLUMNS = [
  ["found", "Encontradas"],
  ["imported", "Novas"],
  ["updated", "Atualizadas"],
  ["duplicates", "Duplicadas"],
  ["rejected", "Com restrição"],
  ["ignored", "Ignoradas"],
  ["pendingReview", "Pendentes de revisão"],
  ["failed", "Erros"],
] as const;

/** Resumo da última execução do "Verificar agora" (totais e por fonte). */
export function RunSummary({ summary }: { summary: MonitorSummary }) {
  const { totals } = summary;
  return (
    <section
      aria-label="Resumo da verificação"
      className="space-y-3 rounded-xl border border-brand/40 bg-brand/5 p-4"
    >
      <p className="text-sm font-medium">
        {summary.sourcesChecked} fonte(s) verificada(s)
        {totals.sourcesWithError > 0 && (
          <span className="text-bad"> · {totals.sourcesWithError} com erro</span>
        )}
        {totals.blockedByRobots > 0 && (
          <span className="text-muted">
            {" "}
            · {totals.blockedByRobots} link(s) bloqueado(s) pelo robots.txt
          </span>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Fonte</th>
              {COLUMNS.map(([, label]) => (
                <th key={label} className="py-2 pr-3 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.sources.map((source) => (
              <tr key={source.name} className="border-b border-line align-top last:border-0">
                <td className="py-2 pr-3">
                  {source.name}
                  {source.error && <span className="block text-xs text-bad">{source.error}</span>}
                  {source.warning && (
                    <span className="block text-xs text-warn">{source.warning}</span>
                  )}
                </td>
                {COLUMNS.map(([key, label]) => (
                  <td key={label} className="py-2 pr-3 text-right tabular-nums">
                    {source[key]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-3">Total</td>
              {COLUMNS.map(([key, label]) => (
                <td key={label} className="py-2 pr-3 text-right tabular-nums">
                  {totals[key]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        “Encontradas” não significa elegíveis: as novas entram como revisão pendente para triagem da
        equipe. “Com restrição” (ex.: exclusivo de outro território) também entram, visíveis com o
        motivo — nada é descartado automaticamente. “Ignoradas” são páginas que não são
        oportunidades (resultado, notícia, página institucional, índice), listadas abaixo com o
        motivo.
      </p>
    </section>
  );
}

/** Configuração da fonte (adaptador). Regras por endereço/título; sem seletores CSS. */
export function SourceConfigForm({
  sourceId,
  adapter,
  linkContains,
  audiovisualOnly,
}: {
  sourceId: string;
  adapter: SourceAdapter;
  linkContains: string | null;
  audiovisualOnly: boolean;
}) {
  const [state, action] = useActionState<SourceActionState, FormData>(
    updateSourceConfig.bind(null, sourceId),
    {},
  );
  return (
    <form action={action} className="mt-3 space-y-3">
      <Field
        label="Filtro de endereço (opcional)"
        name="link_contains"
        maxLength={200}
        defaultValue={linkContains ?? ""}
        placeholder="/editais/"
        hint="Só considera links cujo endereço contém este trecho."
      />
      <TextArea
        label="Ignorar endereços que contenham (um por linha)"
        name="link_excludes"
        defaultValue={adapter.linkExcludes.join("\n")}
        placeholder={"/resultado\n/noticias/"}
      />
      <TextArea
        label="Ignorar títulos que contenham (um por linha)"
        name="title_excludes"
        defaultValue={adapter.titleExcludes.join("\n")}
        placeholder={"encerrado\nacervo"}
      />
      <Field
        label="Máximo de novas por verificação"
        name="max_imports"
        type="number"
        min={1}
        max={10}
        defaultValue={adapter.maxImports}
      />
      <Check name="audiovisual_only" defaultChecked={audiovisualOnly}>
        Fonte exclusiva de audiovisual
      </Check>
      <Check name="classify_pages" defaultChecked={adapter.classifyPages}>
        Classificar páginas antes de importar (recomendado: ignora resultados, notícias e páginas
        institucionais, com o motivo)
      </Check>
      <Check name="allow_pdf_links" defaultChecked={adapter.allowPdfLinks}>
        Aceitar links diretos para PDF
      </Check>
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Salvar configuração</SubmitButton>
    </form>
  );
}

function Check({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 accent-brand"
      />
      <span>{children}</span>
    </label>
  );
}
