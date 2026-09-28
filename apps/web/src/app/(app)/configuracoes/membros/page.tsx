import type { Metadata } from "next";
import { MEMBERSHIP_STATUS_LABELS, ROLE_LABELS, isMembershipStatus } from "@lep/core";
import { Badge, Card, PageHeader, SectionTitle, type BadgeTone } from "@/components/ui";
import { DbErrorNotice } from "@/components/db-error-notice";
import { loadProponent } from "@/lib/proponent";
import { InviteForm, MemberActions } from "./member-forms";
import { ProponentForm } from "./proponent-form";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Membros" };

const STATUS_TONES: Record<"invited" | "active" | "suspended", BadgeTone> = {
  invited: "warn",
  active: "ok",
  suspended: "bad",
};

const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

export default async function MembersPage() {
  const { membership, userId } = await requireMembership("admin");
  const supabase = await createClient();

  // O RLS garante que só membros da própria organização retornam.
  const proponent = await loadProponent(supabase, membership.orgId);
  const { data: members, error } = await supabase
    .from("memberships")
    .select(
      "id, role, status, created_at, invited_at, accepted_at, suspended_at, profiles!memberships_user_id_fkey ( id, email, full_name )",
    )
    .eq("org_id", membership.orgId)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membros"
        description="Convide pessoas, reenvie convites e suspenda ou reative acessos. Só vínculos ativos acessam a plataforma."
      />

      <Card>
        <SectionTitle>Proponente — {membership.orgName}</SectionTitle>
        <p className="mb-4 text-sm text-muted">
          A {membership.orgName} é sempre a proponente: empresas parceiras não contam para a
          elegibilidade. A sede abaixo decide se um edital com regra de território é elegível ou
          fica marcado como “restrição territorial” (visível, com motivo — docs/diretrizes-lep.md).
        </p>
        <ProponentForm state={proponent.state} city={proponent.city} />
      </Card>

      <Card>
        <SectionTitle>Convidar membro</SectionTitle>
        <InviteForm />
      </Card>

      {error ? (
        <DbErrorNotice error={error} isAdmin context="membros" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Perfil</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Desde</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members?.map((member) => {
                const status = isMembershipStatus(member.status) ? member.status : "active";
                const since =
                  status === "invited"
                    ? `convidado em ${date(member.invited_at)}`
                    : status === "suspended"
                      ? `suspenso em ${date(member.suspended_at)}`
                      : date(member.accepted_at ?? member.created_at);
                return (
                  <tr key={member.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3">{member.profiles?.full_name ?? "—"}</td>
                    <td className="px-4 py-3">{member.profiles?.email}</td>
                    <td className="px-4 py-3">{ROLE_LABELS[member.role]}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[status]}>{MEMBERSHIP_STATUS_LABELS[status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{since}</td>
                    <td className="px-4 py-3">
                      <MemberActions
                        membershipId={member.id}
                        status={status}
                        isSelf={member.profiles?.id === userId}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
