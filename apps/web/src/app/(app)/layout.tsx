import Link from "next/link";
import { can, ROLE_LABELS } from "@lep/core";
import { NavLinks } from "@/components/nav-links";
import { Logo } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";
import { requireMembership } from "@/lib/auth/session";

/**
 * Área autenticada. Todas as páginas dentro de (app) exigem login e vínculo com
 * uma organização. Novos módulos adicionam seus itens de navegação aqui.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, fullName, membership } = await requireMembership();

  const navigation = [
    { href: "/", label: "Início" },
    { href: "/editais", label: "Editais" },
    { href: "/projetos", label: "Projetos" },
    ...(can(membership.role, "members.manage")
      ? [{ href: "/configuracoes/membros", label: "Membros" }]
      : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div
          className="h-0.5 bg-gradient-to-r from-brand via-brand/60 to-transparent"
          aria-hidden
        />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-wrap items-center gap-6">
            <Link href="/" className="flex items-center" aria-label="Início — LEP Filmes">
              <Logo />
            </Link>
            <NavLinks items={navigation} />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/conta/senha" className="text-right hover:text-brand">
              <span className="block font-medium">{fullName ?? email}</span>
              <span className="block text-xs text-muted">{ROLE_LABELS[membership.role]}</span>
            </Link>
            <form action={signOut}>
              <button className="rounded-md border border-line px-3 py-1.5 text-muted transition hover:border-brand hover:text-brand">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
