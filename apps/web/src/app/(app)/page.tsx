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
    <div className="space-y-10">
      {senha === "atualizada" && (
        <p className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          Senha atualizada com sucesso.
        </p>
      )}

      <section className="space-y-3">
        <p className="text-sm text-muted">
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
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Inteligência e automação para o <span className="text-brand">audiovisual.</span>
        </h1>
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {metrics.map((metric) => (
            <Link
              key={metric.label}
              href={metric.href}
              className="rounded-xl border border-line bg-card p-5 transition hover:border-brand/60"
            >
              <span className="block text-3xl font-semibold tabular-nums text-brand">
                {metric.value ?? "—"}
              </span>
              <span className="mt-1 block text-sm text-muted">{metric.label}</span>
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
