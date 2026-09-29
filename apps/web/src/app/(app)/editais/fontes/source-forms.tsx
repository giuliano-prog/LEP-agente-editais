"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess, SubmitButton, TextArea } from "@/components/form";
import type { MonitorSummary } from "@/lib/monitor/summary";
import type { SourceAdapter } from "@lep/funding";
import type { CatalogEntry } from "@/lib/monitor/catalog";
import type { SourcePreview } from "@/lib/monitor/run";
import {
  addCatalogSource,
  addDiscoveredSource,
  createSource,
  runDiscoveryNow,
  runMonitorNow,
  testCatalogSource,
  testExistingSource,
  updateSourceConfig,
  type DiscoveryActionState,
  type PreviewState,
  type SourceActionState,
} from "./actions";

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

const PAGE_TYPE_TEXT: Record<string, string> = {
  opportunity: "Oportunidade",
  uncertain: "Incerta (entraria para revisão)",
  listing: "Lista de editais (ignorada)",
  result: "Resultado (ignorada)",
  rectification: "Retificação (ignorada)",
  news: "Notícia (ignorada)",
  institutional: "Institucional (ignorada)",
};

/** Resultado do "Testar fonte": nada foi gravado. */
export function PreviewResult({ preview }: { preview: SourcePreview }) {
  return (
    <section
      aria-label="Resultado do teste"
      className={`space-y-2 rounded-lg border p-3 text-sm ${preview.ok ? "border-line bg-card-raised/40" : "border-bad/40 bg-bad/10"}`}
    >
      <p className={preview.ok ? "font-medium" : "font-medium text-bad"}>{preview.message}</p>
      {preview.finalUrl && (
        <p className="break-all text-xs text-muted">Página lida: {preview.finalUrl}</p>
      )}
      {preview.warnings.map((warning) => (
        <p key={warning} className="text-xs text-warn">
          ⚠ {warning}
        </p>
      ))}
      {preview.samples.length > 0 && (
        <ul className="space-y-2">
          {preview.samples.map((sample) => (
            <li key={sample.url} className="text-xs">
              <a
                href={sample.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:text-brand"
              >
                {sample.title} ↗
              </a>
              <span className="block text-muted">
                {sample.pageType
                  ? (PAGE_TYPE_TEXT[sample.pageType] ?? sample.pageType)
                  : "Não classificada"}
                {sample.deadline && ` · prazo ${sample.deadline.split("-").reverse().join("/")}`}
                {sample.reasons.length > 0 && ` · ${sample.reasons.join(" · ")}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Teste: nada foi gravado nem importado.</p>
    </section>
  );
}

/** Catálogo (etapa 11): cola o endereço oficial, testa e cadastra pausada. */
export function CatalogSourceForm({ entry }: { entry: CatalogEntry }) {
  const [testState, test, testing] = useActionState<PreviewState, FormData>(
    testCatalogSource.bind(null, entry.key),
    {},
  );
  const [addState, add, adding] = useActionState<PreviewState, FormData>(
    addCatalogSource.bind(null, entry.key),
    {},
  );
  return (
    <form className="mt-3 space-y-3">
      <Field label="Nome" name="name" defaultValue={entry.name} maxLength={120} required />
      <Field label="Instituição" name="agency" defaultValue={entry.agency} maxLength={200} />
      <Field
        label="Página oficial de editais"
        name="list_url"
        type="url"
        required
        placeholder="https://…"
        hint="Cole o endereço oficial da listagem (não é preenchido automaticamente)."
      />
      <div className="flex flex-wrap gap-2">
        <button
          formAction={test}
          disabled={testing}
          className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-brand hover:text-brand disabled:opacity-60"
        >
          {testing ? "Testando…" : "Testar"}
        </button>
        <button
          formAction={add}
          disabled={adding}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-surface hover:bg-brand-strong disabled:opacity-60"
        >
          Adicionar (pausada)
        </button>
      </div>
      <FormError message={testState.error ?? addState.error} />
      <FormSuccess message={addState.success} />
      {testState.preview && <PreviewResult preview={testState.preview} />}
    </form>
  );
}

/** "Testar fonte" para uma fonte já cadastrada. */
export function TestSourceButton({ sourceId }: { sourceId: string }) {
  const [state, action, pending] = useActionState<PreviewState>(
    testExistingSource.bind(null, sourceId),
    {},
  );
  return (
    <form action={action} className="w-full space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line px-3 py-1 text-xs hover:border-brand hover:text-brand disabled:opacity-60"
      >
        {pending ? "Testando… (até 30 s)" : "Testar fonte"}
      </button>
      <FormError message={state.error} />
      {state.preview && <PreviewResult preview={state.preview} />}
    </form>
  );
}

const DISCOVERY_METRICS = [
  ["queriesRun", "Consultas"],
  ["resultsReceived", "Resultados"],
  ["analyzed", "Páginas analisadas"],
  ["audiovisualYes", "Audiovisuais"],
  ["audiovisualNo", "Não audiovisuais"],
  ["audiovisualUncertain", "Incertos"],
  ["officialFound", "Fontes oficiais localizadas"],
  ["imported", "Novas oportunidades"],
  ["duplicates", "Já cadastradas (avistamento)"],
  ["alreadyKnown", "Já vistas antes"],
  ["newSources", "Novas fontes"],
  ["failed", "Falhas"],
] as const;

/** "Buscar novas oportunidades" (descoberta web) com o resumo da execução. */
export function DiscoveryButton() {
  const [state, action, pending] = useActionState<DiscoveryActionState>(runDiscoveryNow, {});
  const result = state.result;
  return (
    <form action={action} className="space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-brand/60 px-4 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-60"
      >
        {pending ? "Buscando na web… (até 1 min)" : "Buscar novas oportunidades"}
      </button>
      <FormError message={state.error} />
      {result && result.status !== "not_configured" && (
        <section
          aria-label="Resumo da busca web"
          className="space-y-2 rounded-xl border border-brand/40 bg-brand/5 p-4 text-sm"
        >
          <p className="font-medium">
            Busca web concluída{result.status === "partial" && " (parcial)"}
            {result.providerLimited && (
              <span className="text-warn"> · limite do provedor de busca atingido</span>
            )}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            {DISCOVERY_METRICS.map(([key, label]) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular-nums">{result[key]}</dd>
              </div>
            ))}
          </dl>
          {result.error && <p className="text-xs text-warn">{result.error}</p>}
          <p className="text-xs text-muted">
            Novas oportunidades entram como “revisão pendente”. Não audiovisuais e encerradas não
            viram edital.
          </p>
        </section>
      )}
    </form>
  );
}

/** Nova fonte encontrada pela descoberta web → cadastro PAUSADO para testar e ativar. */
export function DiscoveredSourceForm({ name, listUrl }: { name: string; listUrl: string }) {
  const [state, action] = useActionState<SourceActionState, FormData>(addDiscoveredSource, {});
  return (
    <form key={state.savedAt ?? "discovered"} action={action} className="mt-2 space-y-3">
      <Field label="Nome" name="name" required maxLength={120} defaultValue={`${name} — Editais`} />
      <Field label="Instituição" name="agency" maxLength={200} defaultValue={name} />
      <Field
        label="Página de listagem de editais"
        name="list_url"
        type="url"
        required
        defaultValue={listUrl}
        hint="Confira no site oficial a página que lista as oportunidades (sugestão: página inicial do domínio)."
      />
      <FormError message={state.error} />
      <FormSuccess message={state.success} />
      <SubmitButton>Adicionar pausada</SubmitButton>
    </form>
  );
}
