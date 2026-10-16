import Link from "next/link";
import { toEdital } from "@lep/funding";
import { NavIcon } from "@/components/nav-icon";
import { requireMembership } from "@/lib/auth/session";
import { isActiveEdital, needsReview } from "@/lib/editais/metrics";
import { firstName, type NavIcon as NavIconName } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

const LEP_SITE = "https://www.lepfilmes.com.br/";

const SHORTCUTS: { href: string; title: string; text: string; icon: NavIconName }[] = [
  {
    href: "/editais",
    title: "Editais",
    text: "Oportunidades de financiamento, prazos e aderência às produções.",
    icon: "editais",
  },
  {
    href: "/producoes-atuais",
    title: "Produções Atuais",
    text: "Acompanhamento das produções em andamento.",
    icon: "producoes-atuais",
  },
  {
    href: "/projetos",
    title: "Produções Concluídas",
    text: "Histórico e biblioteca das produções da LEP.",
    icon: "producoes",
  },
  {
    href: "/orcamentos",
    title: "Orçamentos",
    text: "Orçamentos das produções, em um só lugar.",
    icon: "diagnostico",
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

  const editaisQuery = await supabase.from("editais").select("*").eq("org_id", membership.orgId);
  const editais = editaisQuery.error ? null : (editaisQuery.data ?? []).map((row) => toEdital(row));
  // Só números reais. Produções Atuais, Equipe Audiovisual e Orçamentos ainda não têm
  // cadastro no banco: mostram 0 (os exemplos dessas telas NUNCA entram na contagem).
  const metrics: { label: string; value: number | null; href: string }[] = [
    {
      label: "Editais Ativos",
      value: editais ? editais.filter((edital) => isActiveEdital(edital)).length : null,
      href: "/editais",
    },
    {
      label: "Novos Editais para Revisar",
      value: editais ? editais.filter((edital) => needsReview(edital)).length : null,
      href: "/editais?filtro=varredura",
    },
    { label: "Produções Atuais", value: 0, href: "/producoes-atuais" },
    { label: "Equipe Audiovisual", value: 0, href: "/equipe-audiovisual" },
    { label: "Orçamentos Ativos", value: 0, href: "/orcamentos" },
  ];

  const name = firstName(fullName);

  return (
    <div className="space-y-12">
      {senha === "atualizada" && (
        <p
          role="status"
          className="rounded-lg border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok"
        >
          Senha atualizada com sucesso.
        </p>
      )}

      <section className="lep-rise-in relative space-y-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 -z-10 h-64 w-[28rem] max-w-full bg-[radial-gradient(closest-side,rgb(245_130_31/0.10),transparent)]"
        />
        <p className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden className="h-px w-6 bg-brand" />
          {name ? (
            `Olá, ${name}`
          ) : (
            <>
              Olá!{" "}
              <Link href="/conta" className="text-brand hover:underline">
                Cadastre seu nome em Minha conta
              </Link>
            </>
          )}
        </p>
        <h1 className="max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          Inteligência e automação para o <span className="text-brand">audiovisual.</span>
        </h1>
      </section>

      <section aria-label="Atalhos" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card card-interactive group flex flex-col gap-5 p-5"
          >
            <span className="flex items-center justify-between">
              <span className="rounded-lg border border-brand/25 bg-brand/[0.08] p-2 text-brand transition-colors group-hover:border-brand/50">
                <NavIcon name={item.icon} />
              </span>
              <span
                aria-hidden
                className="text-subtle transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
              >
                →
              </span>
            </span>
            <span>
              <span className="block font-semibold text-fg">{item.title}</span>
              <span className="mt-1.5 block text-sm leading-relaxed text-muted">{item.text}</span>
            </span>
          </Link>
        ))}
      </section>

      <section aria-labelledby="visao-geral" className="space-y-4">
        <h2
          id="visao-geral"
          className="eyebrow flex items-center gap-3 after:h-px after:flex-1 after:bg-line"
        >
          Visão Geral
        </h2>
        <div
          className="flex flex-wrap gap-px overflow-hidden rounded-xl border border-line bg-line"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {metrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              className="group flex min-w-0 flex-1 basis-[calc(50%-1px)] flex-col justify-between gap-6 bg-card px-5 py-5 transition-colors hover:bg-card-raised md:basis-[calc(33.333%-1px)] xl:basis-0"
            >
              <span className="text-xs font-medium leading-snug text-muted transition-colors group-hover:text-fg">
                {metric.label}
              </span>
              <span
                className={`block text-4xl font-semibold leading-none tracking-tight tabular-nums sm:text-[2.75rem] ${
                  metric.value ? "text-brand" : "text-fg/85"
                }`}
              >
                {metric.value ?? "—"}
              </span>
            </Link>
          ))}
        </div>
        {!editais && (
          <p className="text-xs text-muted">Não foi possível carregar os editais agora.</p>
        )}
      </section>

      <footer className="border-t border-line pt-6">
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
      </footer>
    </div>
  );
}
