import { AppShell } from "@/components/app-shell";
import { requireMembership } from "@/lib/auth/session";
import { navigationFor } from "@/lib/navigation";

/**
 * Área autenticada. Todas as páginas dentro de (app) exigem login e vínculo ativo com
 * uma organização. Os itens do menu vêm de `lib/navigation.ts` (fonte única), já
 * filtrados pelo papel; cada rota continua protegida no servidor.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { fullName, membership } = await requireMembership();
  return (
    <AppShell
      items={navigationFor(membership.role)}
      // Nome sem e-mail; foto ainda não existe no cadastro (avatar com iniciais).
      user={{ name: fullName?.trim() || null, avatarUrl: null }}
      orgName={membership.orgName}
    >
      {children}
    </AppShell>
  );
}
