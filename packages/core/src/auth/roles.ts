/**
 * Papéis da plataforma. A ordem importa: cada papel inclui as permissões dos anteriores.
 * Deve permanecer igual ao enum `core.app_role` no banco (supabase/migrations).
 */
export const ROLES = ["viewer", "editor", "admin"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  viewer: "Visualização",
  editor: "Editor/Revisor",
  admin: "Administrador",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** `true` se `role` tem nível igual ou superior a `minimum`. */
export function hasRole(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ROLES.indexOf(role) >= ROLES.indexOf(minimum);
}
