"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ADHERENCE_LABELS, MATCH_DISCLAIMER, type Evidence, type Highlight } from "@lep/funding";
import {
  analyzeEditalUpload,
  createEditalFromUpload,
  type EditalActionState,
} from "@/app/(app)/editais/actions";
import { FormError } from "@/components/form";
import { Badge, type BadgeTone } from "@/components/ui";
import type { EditalAnalysisView, SourcedValue } from "@/lib/editais/analysis";
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, uploadPath } from "@/lib/editais/constants";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { ActionFeedback } from "./action-feedback";

const TERRITORY_TONES: Record<string, BadgeTone> = {
  eligible: "ok",
  territorial_restriction: "bad",
  individual: "bad",
  not_eligible: "bad",
  via_partner: "warn",
  needs_review: "warn",
  not_confirmed: "neutral",
};

/** Envia o PDF ao Storage privado da organização (mesmo caminho do cadastro). */
async function uploadPdf(orgId: string, file: File): Promise<string> {
  const path = uploadPath(orgId, crypto.randomUUID());
  const { error } = await createBrowserSupabase()
    .storage.from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  return path;
}

/** Analisar Edital: PDF → análise na tela → (opcional) Adicionar aos Editais. */
export function AnalyzeEdital({ orgId }: { orgId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [analysis, setAnalysis] = useState<EditalAnalysisView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addState, setAddState] = useState<EditalActionState>({});
  const [analyzing, startAnalyzing] = useTransition();
  const [adding, startAdding] = useTransition();

  function analyze(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file) return setError("Selecione o PDF do edital.");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return setError("Envie um arquivo PDF.");
    }
    if (file.size > MAX_DOCUMENT_BYTES) return setError("O arquivo excede o limite de 25 MB.");
    startAnalyzing(async () => {
      setAnalysis(null);
      setAddState({});
      let path: string;
      try {
        path = await uploadPdf(orgId, file);
      } catch {
        setError("Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.");
        return;
      }
      const result = await analyzeEditalUpload({ path, fileName: file.name });
      if (result.error || !result.analysis) {
        setError(result.error ?? "Não foi possível analisar o edital.");
        return;
      }
      setAnalysis(result.analysis);
    });
  }

  function add() {
    if (!file || !analysis) return;
    startAdding(async () => {
      setAddState({});
      try {
        const path = await uploadPdf(orgId, file);
        // Sucesso redireciona para a revisão do edital recém-cadastrado.
        const result = await createEditalFromUpload({
          path,
          fileName: file.name,
          title: analysis.title,
        });
        setAddState(result ?? {});
      } catch {
        setAddState({ error: "Não foi possível enviar o arquivo. Tente novamente." });
      }
    });
  }

  function reset() {
    setFile(null);
    setAnalysis(null);
    setAddState({});
    setError(null);
    setInputKey((key) => key + 1);
  }

  return (
    <div className="space-y-6">
      {!analysis && (
        <form onSubmit={analyze} className="space-y-4 rounded-xl border border-line bg-card p-5">
          <label className="block space-y-1">
            <span className="text-sm font-medium">PDF do edital</span>
            <input
              key={inputKey}
              type="file"
              name="edital"
              accept="application/pdf,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-md border border-line bg-card-raised text-sm text-muted file:mr-3 file:cursor-pointer file:border-0 file:bg-brand/15 file:px-3 file:py-2 file:text-brand hover:file:bg-brand/25"
            />
            <span className="block text-xs text-muted">
              Até 25 MB. A análise não cadastra o edital: você decide depois.
            </span>
          </label>
          <FormError message={error ?? undefined} />
          <button
            type="submit"
            disabled={analyzing}
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong disabled:opacity-60 sm:w-auto"
          >
            {analyzing ? "Analisando o edital…" : "Analisar edital"}
          </button>
        </form>
      )}

      {analysis && (
        <>
          <AnalysisReport analysis={analysis} />
          <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-5">
            <ActionFeedback state={addState} />
            <div className="flex flex-col gap-2 sm:flex-row">
              {!analysis.duplicate && (
                <button
                  type="button"
                  onClick={add}
                  disabled={adding}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong disabled:opacity-60"
                >
                  {adding ? "Adicionando…" : "Adicionar aos Editais"}
                </button>
              )}
              {analysis.duplicate && (
                <Link
                  href={`/editais/${analysis.duplicate.editalId}`}
                  className="rounded-md bg-brand px-4 py-2 text-center text-sm font-semibold text-surface transition hover:bg-brand-strong"
                >
                  Abrir edital já cadastrado
                </Link>
              )}
              <button
                type="button"
                onClick={reset}
                className="rounded-md border border-line px-4 py-2 text-sm hover:border-brand hover:text-brand"
              >
                Analisar outro edital
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Source({ evidence }: { evidence: Evidence | null | undefined }) {
  if (!evidence) return null;
  return (
    <details className="mt-1 text-xs text-muted">
      <summary className="cursor-pointer hover:text-brand">Trecho do documento</summary>
      <blockquote className="mt-1 border-l-2 border-brand/40 pl-3 italic">
        “{evidence.snippet}”
      </blockquote>
    </details>
  );
}

function Info({ label, item }: { label: string; item: SourcedValue | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">
        {item ? item.value : <span className="text-muted">Não identificado</span>}
        <Source evidence={item?.evidence} />
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-line bg-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Quotes({ items, empty }: { items: Highlight[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.text} className="border-l-2 border-line pl-3">
          {item.text}
        </li>
      ))}
    </ul>
  );
}

export function AnalysisReport({ analysis }: { analysis: EditalAnalysisView }) {
  const adherence = analysis.adherence;
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <p className="text-xs text-muted">
          {analysis.fileName}
          {analysis.pages > 0 && ` · ${analysis.pages} página(s)`}
        </p>
        <h2 className="text-xl font-semibold leading-snug">{analysis.title}</h2>
        {analysis.situation && <Badge tone="brand">{analysis.situation}</Badge>}
      </header>

      {analysis.attention.length > 0 && (
        <Section title="Pontos de atenção">
          <ul className="space-y-1.5 text-sm">
            {analysis.attention.map((note) => (
              <li key={note} className="flex gap-2">
                <span aria-hidden className="text-warn">
                  ⚠
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Resumo do edital">
        {analysis.summary ? (
          <>
            <p className="text-sm">{analysis.summary.text}</p>
            <Source evidence={analysis.summary.evidence} />
          </>
        ) : (
          <p className="text-sm text-muted">Objeto do edital não identificado no documento.</p>
        )}
      </Section>

      <Section title="Informações principais">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Instituição" item={analysis.institution} />
          <Info label="Prazo de inscrição" item={analysis.deadline} />
          <Info label="Abertura das inscrições" item={analysis.opensAt} />
          <Info label="Valor total" item={analysis.totalAmount} />
          <Info label="Valor por projeto" item={analysis.maxAmountPerProject} />
          <Info label="Projetos selecionados" item={analysis.projectCount} />
          <Info label="Formatos" item={analysis.formats} />
          <Info label="Gêneros" item={analysis.genres} />
          <Info label="Estágios" item={analysis.stages} />
        </dl>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Quem pode participar">
          <Quotes items={analysis.participation} empty="Não identificado no documento." />
        </Section>
        <Section title="Territorialidade">
          <div className="space-y-2 text-sm">
            <Badge tone={TERRITORY_TONES[analysis.territoriality.status] ?? "neutral"}>
              {analysis.territoriality.label}
            </Badge>
            <p>{analysis.territoriality.reason}</p>
            {analysis.territoriality.territories.length > 0 && (
              <p className="text-xs text-muted">
                Territórios citados: {analysis.territoriality.territories.join(", ")}
              </p>
            )}
            {analysis.territoriality.evidence && (
              <Source evidence={{ snippet: analysis.territoriality.evidence, source: "pdf" }} />
            )}
          </div>
        </Section>
        <Section title="Requisitos">
          <Quotes items={analysis.requirements} empty="Não identificados no documento." />
        </Section>
        <Section title="Documentação exigida">
          <Quotes items={analysis.documents} empty="Não identificada no documento." />
        </Section>
      </div>

      <Section title="Aderência à LEP">
        {adherence ? (
          <div className="space-y-3 text-sm">
            <Badge tone={adherence.blocked ? "bad" : adherence.level === "high" ? "ok" : "warn"}>
              {ADHERENCE_LABELS[adherence.level]}
              {adherence.score !== null && adherence.level !== "insufficient"
                ? ` · ${adherence.score}`
                : ""}
            </Badge>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wider text-muted">
                Produções compatíveis ({analysis.compatible.length}/{adherence.totalProjects})
              </p>
              {analysis.compatible.length > 0 ? (
                <ul className="space-y-1">
                  {analysis.compatible.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/projetos/${item.id}`} className="hover:text-brand">
                        {item.title}
                      </Link>
                      <span className="text-xs text-muted">
                        {item.verdict}
                        {item.score !== null && ` · ${item.score}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">Nenhuma produção compatível pelos critérios do edital.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Não foi possível carregar as produções da LEP.</p>
        )}
        <p className="text-xs text-muted">{MATCH_DISCLAIMER}</p>
      </Section>
    </div>
  );
}
