"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Avatar } from "@/components/avatar";
import { NavIcon } from "@/components/nav-icon";
import { Logo } from "@/components/ui";
import { signOut } from "@/lib/auth/actions";
import { isActiveHref, type NavigationItem } from "@/lib/navigation";

const DESKTOP = "(min-width: 1024px)";
const STORAGE_KEY = "lep.sidebar.desktop";

type ShellUser = { name: string | null; avatarUrl: string | null };

// Preferência do menu no desktop (aberto/recolhido), lembrada neste navegador.
const SIDEBAR_EVENT = "lep:sidebar";
function readSidebar(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "open";
  } catch {
    return "open";
  }
}
function writeSidebar(value: "open" | "closed") {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // sem armazenamento local: vale só até recarregar
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}
function subscribeSidebar(callback: () => void) {
  window.addEventListener(SIDEBAR_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Casca da área autenticada: menu lateral (sidebar) com botão hamburger.
 * - Desktop (≥1024px): sidebar fixa ao lado do conteúdo; o hamburger recolhe/expande
 *   (preferência lembrada neste navegador).
 * - Tablet e celular: sidebar em gaveta sobre o conteúdo, fecha ao navegar, no fundo
 *   escurecido ou com Esc.
 */
export function AppShell({
  items,
  user,
  orgName,
  children,
}: {
  items: NavigationItem[];
  user: ShellUser;
  orgName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // A gaveta fica aberta só na página em que foi aberta: navegar a fecha sozinha.
  const [mobileOpenAt, setMobileOpenAt] = useState<string | null>(null);
  const mobileOpen = mobileOpenAt === pathname;
  const closeMobile = () => setMobileOpenAt(null);
  const desktopOpen =
    useSyncExternalStore(subscribeSidebar, readSidebar, () => "open") !== "closed";

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMobileOpenAt(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggle = () => {
    if (window.matchMedia(DESKTOP).matches) {
      writeSidebar(desktopOpen ? "closed" : "open");
    } else {
      setMobileOpenAt(mobileOpen ? null : pathname);
    }
  };

  const sidebar = (
    <SidebarContent items={items} user={user} orgName={orgName} pathname={pathname} />
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside
        id="lep-sidebar"
        aria-label="Menu principal"
        className={`${
          desktopOpen ? "lg:flex" : "lg:hidden"
        } sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-card/70`}
      >
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            aria-label="Fechar menu"
            className="lep-fade-in absolute inset-0 bg-black/65 backdrop-blur-[2px]"
            onClick={closeMobile}
          />
          <aside
            aria-label="Menu principal"
            className="lep-drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-card"
            style={{ boxShadow: "var(--shadow-pop)" }}
          >
            <button
              onClick={closeMobile}
              aria-label="Fechar menu"
              className="btn-icon absolute right-3 top-4 transition-colors"
            >
              <NavIcon name="close" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
          <div
            className="h-px bg-gradient-to-r from-brand-red via-brand/70 to-transparent"
            aria-hidden
          />
          <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
            <button
              onClick={toggle}
              aria-label="Abrir ou fechar o menu"
              aria-controls="lep-sidebar"
              aria-expanded={mobileOpen || undefined}
              className="btn-icon transition-colors"
            >
              <NavIcon name="menu" />
            </button>
            <Link
              href="/"
              aria-label="Início — LEP Filmes"
              className={desktopOpen ? "lg:hidden" : ""}
            >
              <Logo />
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  items,
  user,
  orgName,
  pathname,
}: {
  items: NavigationItem[];
  user: ShellUser;
  orgName: string;
  pathname: string;
}) {
  const main = items.filter((item) => item.section === "main");
  const admin = items.filter((item) => item.section === "admin");
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 pb-4 pt-6">
      <Link href="/" aria-label="Início — LEP Filmes" className="inline-flex self-start px-2">
        <Logo size="md" />
      </Link>
      <MemberMenu user={user} />
      <nav aria-label="Módulos" className="flex flex-1 flex-col gap-0.5 text-sm">
        {main.map((item) => (
          <NavItem key={item.key} item={item} active={isActiveHref(item.href, pathname)} />
        ))}
        {admin.length > 0 && (
          <div className="mt-auto border-t border-line pt-4">
            {admin.map((item) => (
              <NavItem key={item.key} item={item} active={isActiveHref(item.href, pathname)} />
            ))}
          </div>
        )}
      </nav>
      <p className="truncate px-3 text-xs text-subtle">{orgName}</p>
    </div>
  );
}

function NavItem({ item, active }: { item: NavigationItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 ${
        active
          ? "bg-brand/[0.09] font-medium text-fg"
          : "text-muted hover:bg-white/[0.035] hover:text-fg"
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
      <NavIcon
        name={item.icon}
        className={`h-[18px] w-[18px] shrink-0 transition-colors ${
          active ? "text-brand" : "text-subtle group-hover:text-fg"
        }`}
      />
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

/** Foto + nome do membro; ao clicar, "Minha conta" e "Sair" (sem e-mail exposto). */
function MemberMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border border-line bg-card-raised/40 p-2 text-left transition-colors hover:border-line-strong hover:bg-card-raised"
      >
        <Avatar name={user.name} src={user.avatarUrl} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {user.name ?? "Minha conta"}
        </span>
        <span
          aria-hidden
          className={`pr-1 text-xs text-subtle transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="lep-pop-in absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-line-strong bg-card p-1"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          <Link
            href="/conta"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-card-raised hover:text-brand"
          >
            Minha conta
          </Link>
          <form action={signOut}>
            <button
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-card-raised hover:text-bad"
            >
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
