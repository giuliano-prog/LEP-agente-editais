import Link from "next/link";
import { CLOSED_STATUSES, toEdital } from "@lep/funding";
import { NavIcon } from "@/components/nav-icon";
import { requireMembership } from "@/lib/auth/session";
import { isAutomaticOrigin } from "@/lib/editais/constants";
import { firstName, type NavIcon as NavIconName } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

const LEP_SITE = "https://www.lepfilmes.com.br/";

const SHORTCUTS: {
  href: string;
  title: string;
  text: string;
  icon: NavIconName;
  soon?: boolean;
}[] = [
  {
    href: "/editais",
    title: "Editais",
    text: "Oportunidades de financiamento, prazos e aderência às produções.",
    icon: "editais",
  },
  {
    href: "/projetos",
    title: "Produções",
    text: "Histórico e cadastro das produções da LEP.",
    icon: "producoes",
  },
  {
    href: "/producoes-atuais",
    title: "Produções Atuais",
    text: "Operação dos trabalhos em andamento.",
    icon: "producoes-atuais",
    soon: true,
  },
  {
    href: "/orcamentos",
    title: "Orçamentos",
    text: "Orçamentos das produções, em um só lugar.",
    icon: "diagnostico",
    soon: true,
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ senha?: string }>;
}) {
  const { fullName, membership } = await requireMembership();
  const { senha } = await searchParams;
  const supabase = await createClient();

  // Só números reais: sem dado confiável, a métrica não aparece.
  const [editaisQuery, projetos] = await Promise.all([
    supabase.from("editais").select("*").eq("org_id", membership.orgId),
    supabase
      .from("projetos")
      .select("*", { count: "exact", head: true })
      .eq("org_id", membership.orgId),
  ]);
  const editais = editaisQuery.error ? null : (editaisQuery.data ?? []).map((row) => toEdital(row));
  const metrics = [
    editais && {
      label: "Editais ativos",
      value: editais.filter(
        (e) =>
          e.reviewStatus !== "discarded" &&
          (e.status === "open" || e.status === "upcoming") &&
          !(e.status && CLOSED_STATUSES.has(e.status)),
      ).length,
      href: "/editais",
    },
    editais && {
      label: "Novos editais para revisar",
      value: editais.filter(
        (e) =>
          isAutomaticOrigin(e.origin) &&
          e.reviewStatus !== "validated" &&
          e.reviewStatus !== "discarded",
      ).length,
      href: "/editais?filtro=varredura",
    },
    !projetos.error &&
      projetos.count !== null && {
        label: "Produções cadastradas",
        value: projetos.count,
        href: "/projetos",
      },
  ].filter((metric): metric is { label: string; value: number; href: string } => !!metric);

  const name = firstName(fullName);

  return (
    <div className="space-y-10">
      {senha === "atualizada" && (
        <p className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          Senha atualizada com sucesso.
        </p>
      )}

      <section className="space-y-3">
        <p className="text-sm text-muted">{name ? `Olá, ${name}` : "Olá!"}</p>
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Inteligência e automação para o <span className="text-brand">audiovisual.</span>
        </h1>
        <a
          href={LEP_SITE}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-brand"
        >
          Acessar site da LEP Filmes
          <NavIcon name="external" className="h-3.5 w-3.5" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      </section>

      <section aria-label="Atalhos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex flex-col gap-3 rounded-xl border border-line bg-card p-5 transition hover:border-brand/60 hover:bg-card-raised"
          >
            <span className="flex items-center justify-between">
              <span className="rounded-lg border border-brand/30 bg-brand/10 p-2 text-brand">
                <NavIcon name={item.icon} />
              </span>
              {item.soon && (
                <span className="text-[11px] uppercase tracking-wider text-muted">
                  Em desenvolvimento
                </span>
              )}
            </span>
            <span>
              <span className="block font-semibold group-hover:text-brand">{item.title} →</span>
              <span className="mt-1 block text-sm text-muted">{item.text}</span>
            </span>
          </Link>
        ))}
      </section>

      <section aria-labelledby="visao-geral" className="space-y-3">
        <h2 id="visao-geral" className="text-sm font-semibold uppercase tracking-wider text-muted">
          Visão Geral
        </h2>
        {metrics.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <Link
                key={metric.label}
                href={metric.href}
                className="rounded-xl border border-line bg-card p-5 transition hover:border-brand/60"
              >
                <span className="block text-3xl font-semibold tabular-nums text-brand">
                  {metric.value}
                </span>
                <span className="mt-1 block text-sm text-muted">{metric.label}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Não foi possível carregar os números agora.</p>
        )}
        <p className="text-xs text-muted">
          Produções atuais, orçamentos ativos e Equipe Audiovisual passam a ser contados quando
          esses módulos tiverem cadastro.
        </p>
      </section>
    </div>
  );
}
