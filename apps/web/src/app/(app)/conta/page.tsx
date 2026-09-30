import type { Metadata } from "next";
import { ROLE_LABELS } from "@lep/core";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { PasswordForm } from "./senha/password-form";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Minha conta" };

/** Minha conta: nome, foto e senha da própria pessoa. O perfil de acesso só o ADM altera. */
export default async function AccountPage() {
  const { fullName, avatarUrl, email, membership } = await requireMembership();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Minha conta" description={email} />

      <Card>
        <SectionTitle>Dados pessoais</SectionTitle>
        <ProfileForm fullName={fullName} avatarUrl={avatarUrl} />
      </Card>

      <Card>
        <SectionTitle>Perfil de acesso</SectionTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge tone={membership.role === "admin" ? "brand" : "neutral"}>
            {ROLE_LABELS[membership.role]}
          </Badge>
          <span>Definido pela administração da {membership.orgName}.</span>
        </div>
      </Card>

      <Card>
        <SectionTitle>Senha</SectionTitle>
        <PasswordForm />
      </Card>
    </div>
  );
}
