"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import {
  advanceAssistantRun,
  cancelAssistantRun,
  decideProposal,
  startAssistantRun,
} from "@/app/(app)/editais/[id]/trabalho/assistant-actions";
import { Badge, type BadgeTone } from "@/components/ui";
import type { RunView } from "@/lib/assistant/run-view";
import type { RunSummary } from "@/lib/assistant/summary";
import { S } from "./styles";

export type PanelMessage = {
  id: string;
  role: "user" | "assistant" | "notice";
  content: string;
  authorName: string | null;
  createdAt: string;
  status: string | null;
  summary: RunSummary | null;
};

export type PanelProposal = {
  id: string;
  summary: string;
  reason: string | null;
  createdAt: string;
};

const RUN_STATUS: Record<RunView["status"], { label: string; tone: BadgeTone }> = {
  queued: { label: "Aguardando", tone: "neutral" },
  running: { label: "Processando", tone: "brand" },
  completed: { label: "Concluída", tone: "ok" },
  partial: { label: "Parcial", tone: "warn" },
  failed: { label: "Falhou", tone: "bad" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};

const isActive = (run: RunView | null) =>
  run !== null && (run.status === "queued" || run.status === "running");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const time = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });

/** Negrito simples (**texto**) e listas com "- " — sem HTML vindo do modelo. */
function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((block, blockIndex) => {
        const lines = block.split("\n");
        const bullets = lines.every((line) => /^\s*([-•*]|\d+[.)])\s+/.test(line));
        const inline = (line: string) =>
          line
            .split(/(\*\*[^*]+\*\*)/g)
            .map((part, index) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={index}>{part.slice(2, -2)}</strong>
              ) : (
                <Fragment key={index}>{part.replace(/^#{1,4}\s+/, "")}</Fragment>
              ),
            );
        return bullets ? (
          <ul key={blockIndex} className="list-disc space-y-0.5 pl-5">
            {lines.map((line, index) => (
              <li key={index}>{inline(line.replace(/^\s*([-•*]|\d+[.)])\s+/, ""))}</li>
            ))}
          </ul>
        ) : (
          <p key={blockIndex} className="whitespace-pre-line">
            {lines.map((line, index) => (
              <Fragment key={index}>
                {index > 0 && "\n"}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Painel ASSISTENTE LEP (ADR-0027): conversa persistida da inscrição, botão “Analisar
 * inscrição com IA” e acompanhamento da execução. O navegador só conduz os passos — cada
 * passo roda no servidor (chave da Anthropic nunca chega aqui) e grava tudo no banco;
 * recarregar a página retoma a execução de onde parou.
 */
export function AssistantPanel({
  editalId,
  canEdit,
  configured,
  notConfiguredReason,
  modelLabel,
  messages,
  activeRun: initialRun,
  lastRun,
  proposals,
}: {
  editalId: string;
  canEdit: boolean;
  configured: boolean;
  notConfiguredReason: string | null;
  modelLabel: string;
  messages: PanelMessage[];
  activeRun: RunView | null;
  lastRun: RunView | null;
  proposals: PanelProposal[];
}) {
  const router = useRouter();
  const [run, setRun] = useState<RunView | null>(initialRun);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [deciding, setDeciding] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const runId = isActive(run) ? run!.id : null;

  // Uma execução ativa vinda do servidor (outra aba / recarregamento) é retomada.
  const [seenRunId, setSeenRunId] = useState(initialRun?.id ?? null);
  if (initialRun && isActive(initialRun) && initialRun.id !== seenRunId) {
    setSeenRunId(initialRun.id);
    if (!isActive(run)) setRun(initialRun);
  }

  // Conduz os passos enquanto a execução estiver ativa.
  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    (async () => {
      let failures = 0;
      while (!stopped) {
        const result = await advanceAssistantRun(editalId, runId);
        if (stopped) return;
        if (!result.ok) {
          failures += 1;
          if (failures >= 3) {
            setError(result.error);
            return;
          }
          await wait(3000 * failures);
          continue;
        }
        failures = 0;
        setRun(result.data);
        // A Área de Trabalho é atualizada a cada passo (checklist, achados, prontidão).
        router.refresh();
        if (!isActive(result.data)) {
          setPendingText(null);
          return;
        }
        if (result.data.retryAfterMs) await wait(result.data.retryAfterMs);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [runId, editalId, router]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, pendingText]);

  const start = (kind: "chat" | "full_analysis") => {
    const request = kind === "chat" ? draft.trim() : null;
    if (kind === "chat" && !request) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await startAssistantRun(editalId, { kind, request });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPendingText(kind === "chat" ? request : "Analisar inscrição com IA.");
      setDraft("");
      setRun(result.data);
      router.refresh();
    });
  };

  const cancel = async () => {
    if (!run) return;
    const result = await cancelAssistantRun(editalId, run.id);
    if (!result.ok) setError(result.error);
    setRun((current) => (current ? { ...current, status: "cancelled" } : current));
    setPendingText(null);
    router.refresh();
  };

  const decide = async (proposalId: string, decision: "approve" | "decline") => {
    setDeciding(proposalId);
    setError(null);
    const result = await decideProposal(editalId, proposalId, decision);
    setDeciding(null);
    if (!result.ok) setError(result.error);
    else setNotice(result.data);
    router.refresh();
  };

  const busy = starting || isActive(run);
  const shownRun = isActive(run) ? run : (run ?? lastRun);

  return (
    <div className={`${S.card} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="assistente-titulo" className="flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden className="text-brand">
              ✦
            </span>
            Assistente LEP
          </h2>
          <p className="text-xs text-muted">
            Agente de IA que lê o edital, organiza esta inscrição e registra tudo aqui, com
            evidência. Pede sua confirmação antes de decisões sensíveis. Modelo: {modelLabel}.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => start("full_analysis")}
            disabled={busy || !configured}
            className={S.primary}
          >
            Analisar inscrição com IA
          </button>
        )}
      </div>

      {!configured && (
        <p role="status" className="border-b border-warn/30 bg-warn/10 px-5 py-3 text-sm text-warn">
          Assistente indisponível: {notConfiguredReason ?? "não configurado no servidor."} O
          restante da Área de Trabalho funciona normalmente.
        </p>
      )}

      {shownRun && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-line bg-card-raised/40 px-5 py-2.5 text-xs"
          aria-live="polite"
        >
          <Badge tone={RUN_STATUS[shownRun.status].tone}>{RUN_STATUS[shownRun.status].label}</Badge>
          {isActive(shownRun) && (
            <span className="inline-flex items-center gap-2 font-medium text-brand">
              <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden />
              {shownRun.phase ?? "IA analisando…"}
            </span>
          )}
          <span className="text-muted">
            {shownRun.kind === "full_analysis" ? "Análise completa" : "Conversa"} · passo{" "}
            {shownRun.stepCount}/{shownRun.maxSteps} · {shownRun.toolCalls} ação(ões) de ferramenta
            · custo estimado US$ {shownRun.costUsd.toFixed(2)}
          </span>
          {shownRun.error && !isActive(shownRun) && (
            <span className="text-bad">Erro: {shownRun.error}</span>
          )}
          {isActive(shownRun) && canEdit && (
            <button type="button" onClick={cancel} className={`${S.small} ml-auto`}>
              Cancelar
            </button>
          )}
        </div>
      )}

      <div ref={listRef} className="max-h-[32rem] space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && !pendingText ? (
          <p className="rounded-lg border border-dashed border-line p-5 text-center text-sm text-muted">
            {canEdit
              ? "Peça ao Assistente para analisar o edital e organizar a inscrição — ou faça uma pergunta específica. A conversa fica salva nesta inscrição."
              : "Nenhuma conversa ainda. Diretoria e ADM acionam o Assistente."}
          </p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        {pendingText &&
          !messages.some(
            (message) => message.role === "user" && message.content === pendingText,
          ) && (
            <MessageBubble
              message={{
                id: "pending",
                role: "user",
                content: pendingText,
                authorName: "Você",
                createdAt: new Date().toISOString(),
                status: null,
                summary: null,
              }}
            />
          )}
      </div>

      {proposals.length > 0 && (
        <div className="space-y-2 border-t border-line bg-warn/5 px-5 py-4">
          <h3 className="text-sm font-semibold text-warn">
            Aguardando sua confirmação ({proposals.length})
          </h3>
          <ul className="space-y-2">
            {proposals.map((proposal) => (
              <li
                key={proposal.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-warn/30 bg-card p-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{proposal.summary}</span>
                  {proposal.reason && (
                    <span className="block text-xs text-muted">Motivo: {proposal.reason}</span>
                  )}
                  <span className="block text-xs text-muted">
                    Proposta em {time(proposal.createdAt)}
                  </span>
                </span>
                {canEdit && (
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={deciding !== null}
                      onClick={() => decide(proposal.id, "approve")}
                      className={S.confirm}
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={deciding !== null}
                      onClick={() => decide(proposal.id, "decline")}
                      className={S.small}
                    >
                      Recusar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(error || notice) && (
        <p
          role={error ? "alert" : "status"}
          className={`border-t px-5 py-2.5 text-sm ${error ? "border-bad/30 bg-bad/10 text-bad" : "border-ok/30 bg-ok/10 text-ok"}`}
        >
          {error ?? notice}
        </p>
      )}

      {canEdit ? (
        <form
          className="flex flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            start("chat");
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Mensagem para o Assistente LEP</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  start("chat");
                }
              }}
              rows={2}
              maxLength={8000}
              disabled={!configured}
              placeholder="Ex.: Analise completamente este edital e organize a inscrição."
              className={`${S.control} resize-y`}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !configured || !draft.trim()}
            className={S.primary}
          >
            {busy ? "IA trabalhando…" : "Enviar"}
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Somente Diretoria e ADM acionam o Assistente. Você pode acompanhar a conversa.
        </p>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: PanelMessage }) {
  if (message.role === "notice") {
    return (
      <p className="rounded-lg border border-line bg-card-raised/40 px-3 py-2 text-xs text-muted">
        {message.content} <span className="opacity-70">· {time(message.createdAt)}</span>
      </p>
    );
  }
  const mine = message.role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[92%] space-y-2 rounded-xl border px-4 py-3 ${mine ? "border-brand/30 bg-brand/10" : "border-line bg-card-raised/50"}`}
      >
        <p className="text-xs text-muted">
          {mine ? (message.authorName ?? "Equipe") : "Assistente LEP"} · {time(message.createdAt)}
          {message.status === "partial" && " · execução parcial"}
        </p>
        <RichText text={message.content} />
        {message.summary && message.summary.entries.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Resumo do que foi registrado">
            {message.summary.entries.map((entry) => (
              <li key={entry.key}>
                <a
                  href={`#${entry.anchor}`}
                  className="inline-block rounded-full border border-brand/40 px-2.5 py-0.5 text-xs text-brand hover:bg-brand/10"
                >
                  {entry.count} {entry.label}
                </a>
              </li>
            ))}
            {message.summary.errors > 0 && (
              <li className="rounded-full border border-warn/40 px-2.5 py-0.5 text-xs text-warn">
                {message.summary.errors} ação(ões) com erro (ver histórico)
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
