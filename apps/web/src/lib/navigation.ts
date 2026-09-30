import { can, type Permission, type Role } from "@lep/core";

/**
 * Navegação global (fonte única). Novos módulos entram aqui — nunca como links
 * espalhados em componentes. Cada item declara a permissão necessária; a rota
 * continua protegendo o acesso no servidor (`requireMembership`), o menu só esconde.
 *
 * `status`: "active" = módulo funcional; "blueprint" = planta (estrutura visual
 * do módulo futuro, sem dados fictícios).
 */
export type NavIcon =
  "home" | "editais" | "producoes" | "producoes-atuais" | "equipe" | "membros" | "diagnostico";

export type NavigationItem = {
  key: string;
  label: string;
  href: string;
  icon: NavIcon;
  /** Permissão exigida para ver o item (padrão: qualquer membro ativo). */
  permission?: Permission;
  status: "active" | "blueprint";
  /** "main" = menu principal; "admin" = bloco separado ao final. */
  section: "main" | "admin";
};

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: "inicio", label: "Início", href: "/", icon: "home", status: "active", section: "main" },
  {
    key: "editais",
    label: "Editais",
    href: "/editais",
    icon: "editais",
    status: "active",
    section: "main",
  },
  {
    // Rótulo "Produções"; a rota e o banco continuam `projetos` (compatibilidade).
    key: "producoes",
    label: "Produções",
    href: "/projetos",
    icon: "producoes",
    status: "active",
    section: "main",
  },
  {
    key: "producoes-atuais",
    label: "Produções Atuais",
    href: "/producoes-atuais",
    icon: "producoes-atuais",
    status: "blueprint",
    section: "main",
  },
  {
    key: "equipe-audiovisual",
    label: "Equipe Audiovisual",
    href: "/equipe-audiovisual",
    icon: "equipe",
    status: "blueprint",
    section: "main",
  },
  {
    key: "membros",
    label: "Membros",
    href: "/configuracoes/membros",
    icon: "membros",
    permission: "members.read",
    status: "active",
    section: "main",
  },
  {
    key: "diagnostico",
    label: "Diagnóstico",
    href: "/configuracoes/diagnostico",
    icon: "diagnostico",
    permission: "diagnostics.view",
    status: "active",
    section: "admin",
  },
];

/** Itens visíveis para o papel (sem permissão declarada = qualquer membro ativo). */
export function navigationFor(role: Role | null | undefined): NavigationItem[] {
  if (!role) return [];
  return NAVIGATION_ITEMS.filter((item) => !item.permission || can(role, item.permission));
}

/** Item ativo para a rota atual ("/" só casa exatamente). */
export function isActiveHref(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Primeiro nome para saudações ("Maria Clara Souza" → "Maria"). */
export function firstName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Iniciais para o avatar sem foto ("Maria Clara Souza" → "MS"). */
export function initials(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? [parts[0]![0]] : [parts[0]![0], parts.at(-1)![0]];
  return letters.join("").toUpperCase();
}
