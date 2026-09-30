import Link from "next/link";
import type { Adherence } from "@lep/funding";
import { AdherenceCell } from "@/components/adherence-badge";
import { Deadline, EditalStatusBadge } from "@/components/edital-badges";
import { NavIcon } from "@/components/nav-icon";
import { Badge } from "@/components/ui";

const ORIGIN_TEXT: Record<string, string> = {
  monitor: "Fonte cadastrada",
  web_discovery: "Busca na web",
  manual: "Cadastro manual",
};

/** Ações do edital: página oficial (nova aba) e ficha interna completa. */
export function EditalActions({ id, officialUrl }: { id: string; officialUrl: string | null }) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {officialUrl && (
        <a
          href={officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-brand/60 px-3 py-1.5 font-medium text-brand transition hover:bg-brand/10"
        >
          Acessar edital <NavIcon name="external" className="h-3.5 w-3.5" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      )}
      <Link
        href={`/editais/${id}`}
        className="rounded-md border border-line px-3 py-1.5 transition hover:border-brand hover:text-brand"
      >
        Ver análise
      </Link>
    </div>
  );
}

/** Cartão compacto de edital (celular e resultados de busca). */
export function EditalCard({
  edital,
  highlight,
}: {
  edital: {
    id: string;
    title: string;
    agency: string | null;
    deadline: string | null;
    status: string | null;
    officialUrl: string | null;
    origin: string;
    adherence: Adherence | null;
  };
  /** Selo opcional (ex.: "Novo", "Já cadastrado"). */
  highlight?: { label: string; tone: "brand" | "neutral" };
}) {
  return (
    <article className="space-y-3 rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {highlight && <Badge tone={highlight.tone}>{highlight.label}</Badge>}
        <EditalStatusBadge status={edital.status} />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold leading-snug">{edital.title}</h3>
        <p className="text-sm text-muted">
          {edital.agency ?? "Instituição não informada"}
          {ORIGIN_TEXT[edital.origin] && ` · ${ORIGIN_TEXT[edital.origin]}`}
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Prazo</dt>
          <dd>
            <Deadline value={edital.deadline} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted">Aderência</dt>
          <dd>
            <AdherenceCell adherence={edital.adherence} />
          </dd>
        </div>
      </dl>
      <EditalActions id={edital.id} officialUrl={edital.officialUrl} />
    </article>
  );
}
