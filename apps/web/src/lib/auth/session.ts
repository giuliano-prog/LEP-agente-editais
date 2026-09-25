import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { hasRole, type Role } from "@lep/core";
import { createClient } from "@/lib/supabase/server";

export type Membership = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: Role;
};

export type Session = {
  userId: string;
  email: string;
  fullName: string | null;
  membership: Membership | null;
};

/**
 * Sessão do usuário atual (uma consulta por requisição, graças ao `cache`).
 * `getUser()` valida o token no servidor de autenticação — não confia só no cookie.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    // Etapa 0: a LEP é a única organização; usamos o vínculo mais antigo.
    // A troca de organização ativa entra quando houver mais de uma.
    supabase
      .from("memberships")
      .select("role, organizations ( id, name, slug )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    membership: membership?.organizations
      ? {
          orgId: membership.organizations.id,
          orgName: membership.organizations.name,
          orgSlug: membership.organizations.slug,
          role: membership.role,
        }
      : null,
  };
});

/** Exige usuário autenticado. */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Exige usuário autenticado, vinculado a uma organização e com papel mínimo. */
export async function requireMembership(
  minimumRole: Role = "viewer",
): Promise<Session & { membership: Membership }> {
  const session = await requireUser();
  if (!session.membership) redirect("/sem-acesso");
  if (!hasRole(session.membership.role, minimumRole)) redirect("/sem-acesso?motivo=permissao");
  return session as Session & { membership: Membership };
}
