import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@lep/core";
import { TeamDirectory } from "@/components/team/team-directory";
import { PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { DEMO_PROFESSIONALS } from "@/lib/demo/professionals";

export const metadata: Metadata = { title: "Equipe Audiovisual" };

/**
 * Equipe Audiovisual: banco de profissionais (não são usuários — quem tem login fica
 * em Membros). V1: lista DEMONSTRATIVA de `lib/demo/professionals.ts`, marcada como
 * "Exemplo", sem gravação no banco e fora das contagens da Home.
 */
export default async function EquipeAudiovisualPage() {
  const { membership } = await requireMembership();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe Audiovisual"
        description="Banco de profissionais que trabalham nas produções da LEP."
      >
        {can(membership.role, "content.edit") && (
          <Link
            href="/equipe-audiovisual/novo"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface transition hover:bg-brand-strong"
          >
            + Cadastrar Profissional
          </Link>
        )}
      </PageHeader>
      <TeamDirectory professionals={DEMO_PROFESSIONALS} isDemo />
    </div>
  );
}
