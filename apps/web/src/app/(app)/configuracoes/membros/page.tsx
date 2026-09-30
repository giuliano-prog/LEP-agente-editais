import type { Metadata } from "next";
import {
  MEMBERSHIP_STATUS_LABELS,
  ROLE_LABELS,
  can,
  isMembershipStatus,
  type MembershipStatus,
  type Role,
} from "@lep/core";
import { Avatar } from "@/components/avatar";
import { Badge, Card, PageHeader, SectionTitle, type BadgeTone } from "@/components/ui";
import { DbErrorNotice } from "@/components/db-error-notice";
import { InviteForm, MemberActions } from "./member-forms";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Membros" };

const STATUS_TONES: Record<MembershipStatus, BadgeTone> = {
  invited: "warn",
  active: "ok",
  suspended: "bad",
};

const ROLE_TONES: Record<Role, BadgeTone> = {
  admin: "brand",
  editor: "neutral",
  viewer: "neutral",
};

/**
 * Membros = quem usa a plataforma. Todos os perfis consultam a lista; convidar,
 * reenviar, suspender e reativar exigem `members.manage` (ADM).
 *
 * A sede da proponente (usada pelo motor de elegibilidade) continua no banco e em
 * `proponent-form.tsx`/`updateProponent`; o bloco só saiu desta tela.
 */
export default async function MembersPage() {
  const { membership, userId } = await requireMembership();
  const canManage = can(membership.role, "members.manage");
  const supabase = await createClient();

  // O RLS garante que só membros da própria organização retornam.
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, role, status, created_at, profiles!memberships_user_id_fkey ( id, email, full_name )",
    )
    .eq("org_id", membership.orgId)
    .order("created_at", { ascending: true });

  const members = (data ?? [])
    .map((member) => ({
      id: member.id,
      role: member.role,
      status: isMembershipStatus(member.status) ? member.status : ("active" as const),
      name: member.profiles?.full_name?.trim() || null,
      email: member.profiles?.email ?? null,
      isSelf: member.profiles?.id === userId,
    }))
    // Quem não gerencia vê só vínculos ativos (convites e suspensões são assunto do ADM).
    .filter((member) => canManage || member.status === "active");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membros"
        description={
          canManage
            ? "Pessoas com acesso à plataforma. Só vínculos ativos acessam."
            : "Pessoas com acesso à plataforma."
        }
      />

      {canManage && (
        <Card>
          <SectionTitle>Convidar membro</SectionTitle>
          <InviteForm />
        </Card>
      )}

      {error ? (
        <DbErrorNotice error={error} isAdmin={canManage} context="membros" />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-card p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={member.name ?? member.email} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.name ?? "—"}</p>
                    <p className="truncate text-sm text-muted">{member.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ROLE_TONES[member.role]}>{ROLE_LABELS[member.role]}</Badge>
                  {member.status !== "active" && (
                    <Badge tone={STATUS_TONES[member.status]}>
                      {MEMBERSHIP_STATUS_LABELS[member.status]}
                    </Badge>
                  )}
                </div>
                {canManage && (
                  <MemberActions
                    membershipId={member.id}
                    status={member.status}
                    isSelf={member.isSelf}
                  />
                )}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border border-line bg-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted">
                <tr>
                  <th className="w-14 px-4 py-3">
                    <span className="sr-only">Foto</span>
                  </th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3">Perfil</th>
                  {canManage && <th className="px-4 py-3">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-line align-middle last:border-0">
                    <td className="px-4 py-3">
                      <Avatar name={member.name ?? member.email} size="sm" />
                    </td>
                    <td className="px-4 py-3 font-medium">{member.name ?? "—"}</td>
                    <td className="break-all px-4 py-3 text-muted">{member.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={ROLE_TONES[member.role]}>{ROLE_LABELS[member.role]}</Badge>
                        {member.status !== "active" && (
                          <Badge tone={STATUS_TONES[member.status]}>
                            {MEMBERSHIP_STATUS_LABELS[member.status]}
                          </Badge>
                        )}
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <MemberActions
                          membershipId={member.id}
                          status={member.status}
                          isSelf={member.isSelf}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
