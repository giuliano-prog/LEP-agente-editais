import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { hasRole, isMembershipStatus, type MembershipStatus, type Role } from "@lep/core";
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
  /** Status do vínculo quando não há acesso (ex.: suspenso). `null` = sem vínculo algum. */
  membershipStatus: MembershipStatus | null;
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

  const loadMembership = () =>
    // Etapa 0: a LEP é a única organização; usamos o vínculo mais antigo.
    // A troca de organização ativa entra quando houver mais de uma.
    supabase
      .from("memberships")
      .select("role, status, organizations ( id, name, slug )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  const [{ data: profile }, first] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    loadMembership(),
  ]);

  let membership = first.data;
  // Convite pendente + usuário autenticado (link do convite ou login) = convite aceito.
  // O banco só permite que a própria pessoa aceite e nunca reativa um vínculo suspenso.
  if (membership?.status === "invited") {
    const { error } = await supabase.rpc("accept_my_invitations");
    if (!error) membership = (await loadMembership()).data;
  }

  const status = isMembershipStatus(membership?.status) ? membership.status : null;
  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    membershipStatus: status,
    membership:
      status === "active" && membership?.organizations
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
  if (!session.membership) {
    redirect(
      session.membershipStatus === "suspended" ? "/sem-acesso?motivo=suspenso" : "/sem-acesso",
    );
  }
  if (!hasRole(session.membership.role, minimumRole)) redirect("/sem-acesso?motivo=permissao");
  return session as Session & { membership: Membership };
}
