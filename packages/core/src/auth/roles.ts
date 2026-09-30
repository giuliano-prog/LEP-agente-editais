/**
 * Papéis da plataforma. A ordem importa: cada papel inclui as permissões dos anteriores.
 * Deve permanecer igual ao enum `core.app_role` no banco (supabase/migrations).
 */
export const ROLES = ["viewer", "editor", "admin"] as const;

export type Role = (typeof ROLES)[number];

/** Perfis exibidos na interface (nomes usados pela LEP). */
export const ROLE_LABELS: Record<Role, string> = {
  viewer: "Equipe",
  editor: "Diretoria",
  admin: "ADM",
};

/** Resumo curto do perfil (formulário de convite). O detalhe fica em `PERMISSIONS`. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  viewer: "Acesso geral de consulta. Sem Diagnóstico.",
  editor: "Acesso geral; cadastra e revisa editais e produções. Sem Diagnóstico.",
  admin: "Acesso total, incluindo membros, buscas de editais e Diagnóstico.",
};

/** Status do vínculo com a organização. Deve ficar igual ao CHECK de core.memberships.status. */
export const MEMBERSHIP_STATUSES = ["invited", "active", "suspended"] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  invited: "Convidado",
  active: "Ativo",
  suspended: "Suspenso",
};

export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === "string" && (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** `true` se `role` tem nível igual ou superior a `minimum`. */
export function hasRole(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ROLES.indexOf(role) >= ROLES.indexOf(minimum);
}
