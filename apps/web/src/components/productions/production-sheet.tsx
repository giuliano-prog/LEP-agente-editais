import Link from "next/link";
import type { ReactNode } from "react";
import { NavIcon } from "@/components/nav-icon";
import { Badge } from "@/components/ui";
import { youtubeUrls, type ProductionMedia } from "@/lib/productions/media";
import {
  PRODUCTION_AREAS,
  PRODUCTION_LIFECYCLE,
  STAGE_LABELS,
  productionArea,
  type ProductionStage,
} from "@/lib/productions/model";

/** Ciclo de vida; `current` destaca a etapa atual da produção. */
export function LifecycleSteps({ current }: { current?: ProductionStage | null }) {
  const currentIndex = PRODUCTION_LIFECYCLE.findIndex((step) => step.key === current);
  return (
    <ol className="grid gap-2 sm:grid-cols-5" aria-label="Ciclo de vida da produção">
      {PRODUCTION_LIFECYCLE.map((step, index) => {
        const state =
          currentIndex < 0
            ? "idle"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "next";
        return (
          <li
            key={step.key}
            aria-current={state === "current" ? "step" : undefined}
            className={`relative min-w-0 rounded-xl border p-3 ${
              state === "current"
                ? "border-brand bg-brand/10"
                : state === "done"
                  ? "border-brand/30 bg-card"
                  : "border-line bg-card"
            }`}
          >
            <p className="text-xs text-muted">
              {index + 1}
              {state === "current" && " · etapa atual"}
              {state === "done" && " · concluída"}
            </p>
            <p className={`font-medium ${state === "current" ? "text-brand" : ""}`}>{step.label}</p>
            <p className="mt-1 text-xs text-muted">{step.description}</p>
            {index < PRODUCTION_LIFECYCLE.length - 1 && (
              <span
                aria-hidden
                className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-muted sm:block"
              >
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Card inteiro clicável de uma produção (atual ou concluída — a mesma entidade). */
export function ProductionCard({
  href,
  title,
  stage,
  isDemo = false,
  children,
}: {
  href: string;
  title: string;
  stage: ProductionStage;
  isDemo?: boolean;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-card p-5 transition hover:border-brand/60 hover:bg-card-raised"
    >
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone={stage === "finished" || stage === "archived" ? "ok" : "brand"}>
          {STAGE_LABELS[stage]}
        </Badge>
        {isDemo && <Badge>Exemplo</Badge>}
      </span>
      <span className="break-words text-lg font-semibold group-hover:text-brand">{title}</span>
      {children}
      <span className="mt-auto text-sm text-muted group-hover:text-brand">Abrir ficha →</span>
    </Link>
  );
}

export type SheetFact = { label: string; value: ReactNode };

/**
 * Ficha da Produção — a MESMA para Produções Atuais e Concluídas; muda só o estado.
 * Áreas sem registros mostram o estado vazio da área (sem dados inventados).
 */
export function ProductionSheet({
  title,
  stage,
  isDemo = false,
  basePath,
  area,
  back,
  facts,
  synopsis,
  media,
  budget,
  navigation = "tabs",
}: {
  title: string;
  stage: ProductionStage;
  isDemo?: boolean;
  /** Rota da ficha (as áreas usam ?area=). */
  basePath: string;
  area: string | undefined;
  back: { href: string; label: string };
  facts: SheetFact[];
  synopsis?: string | null;
  media?: ProductionMedia | null;
  /** Orçamento total informado no cadastro (se houver). */
  budget?: string | null;
  /**
   * "tabs" = abas compactas (Produções Concluídas, consulta/histórico);
   * "blocks" = blocos grandes clicáveis (Produções Atuais, uso operacional/celular).
   */
  navigation?: "tabs" | "blocks";
}) {
  const active = productionArea(area);
  return (
    <div className="space-y-6">
      <Link href={back.href} className="inline-block text-sm text-muted hover:text-brand">
        ← {back.label}
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stage === "finished" || stage === "archived" ? "ok" : "brand"}>
            {STAGE_LABELS[stage]}
          </Badge>
          {isDemo && <Badge>Exemplo</Badge>}
        </div>
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      </header>

      <LifecycleSteps current={stage} />

      {navigation === "blocks" ? (
        <nav aria-label="Áreas da produção">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {PRODUCTION_AREAS.map((item) => (
              <li key={item.key} className="min-w-0">
                <Link
                  href={`${item.key === "visao-geral" ? basePath : `${basePath}?area=${item.key}`}#area-atual`}
                  aria-current={item.key === active.key ? "page" : undefined}
                  className={`flex h-full min-h-20 flex-col justify-center rounded-xl border p-4 text-sm font-medium leading-snug transition ${
                    item.key === active.key
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-line bg-card hover:border-brand/60 hover:bg-card-raised"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <nav aria-label="Áreas da produção" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1 border-b border-line">
            {PRODUCTION_AREAS.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.key === "visao-geral" ? basePath : `${basePath}?area=${item.key}`}
                  aria-current={item.key === active.key ? "page" : undefined}
                  scroll={false}
                  className={`block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
                    item.key === active.key
                      ? "border-brand text-brand"
                      : "border-transparent text-muted hover:text-fg"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <section
        id="area-atual"
        aria-labelledby="area-atual-titulo"
        className="scroll-mt-20 space-y-4"
      >
        <div>
          <h2 id="area-atual-titulo" className="text-lg font-semibold">
            {active.label}
          </h2>
          <p className="text-sm text-muted">{active.description}</p>
        </div>

        {active.key === "visao-geral" ? (
          <div className="space-y-4">
            {media && <TrailerCard media={media} />}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <div className="rounded-xl border border-line bg-card p-5">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
                    Sinopse
                  </h3>
                  <p className="whitespace-pre-line text-sm">
                    {synopsis?.trim() || <span className="text-muted">Sinopse não informada.</span>}
                  </p>
                </div>
              </div>
              <dl className="space-y-3 rounded-xl border border-line bg-card p-5 text-sm">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt className="text-xs uppercase tracking-wider text-muted">{fact.label}</dt>
                    <dd className="mt-0.5">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : active.key === "orcamento" && budget ? (
          <div className="rounded-xl border border-line bg-card p-5 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted">Orçamento total informado</p>
            <p className="mt-1 text-2xl font-semibold text-brand">{budget}</p>
            <p className="mt-3 text-muted">Nenhum detalhamento por rubrica registrado.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-card/50 p-8 text-center text-sm text-muted">
            {active.empty}
          </div>
        )}
      </section>
    </div>
  );
}

/** Trailer incorporado (youtube-nocookie, carregamento sob demanda) + link externo. */
function TrailerCard({ media }: { media: ProductionMedia }) {
  const urls = youtubeUrls(media.youtubeId);
  return (
    <section className="space-y-3 rounded-xl border border-line bg-card p-4 sm:p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Trailer / Mídia</h3>
      <div className="relative mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-lg border border-line bg-black">
        <iframe
          src={urls.embed}
          title="Trailer da produção"
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <a
        href={urls.watch}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-brand"
      >
        Assistir no YouTube <NavIcon name="external" className="h-3.5 w-3.5" />
        <span className="sr-only">(abre em nova aba)</span>
      </a>
    </section>
  );
}
