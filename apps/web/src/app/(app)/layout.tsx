import Link from "next/link";
import { can, ROLE_LABELS } from "@lep/core";
import { signOut } from "@/lib/auth/actions";
import { requireMembership } from "@/lib/auth/session";

/**
 * Área autenticada. Todas as páginas dentro de (app) exigem login e vínculo com
 * uma organização. Novos módulos adicionam seus itens de navegação aqui.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, fullName, membership } = await requireMembership();

  const navigation = [
    { href: "/", label: "Início", visible: true },
    {
      href: "/configuracoes/membros",
      label: "Membros",
      visible: can(membership.role, "members.manage"),
    },
  ].filter((item) => item.visible);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              {membership.orgName}
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-600">
              {navigation.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-zinc-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/conta/senha" className="text-right text-zinc-600 hover:text-zinc-900">
              <span className="block font-medium text-zinc-900">{fullName ?? email}</span>
              <span className="block text-xs">{ROLE_LABELS[membership.role]}</span>
            </Link>
            <form action={signOut}>
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
