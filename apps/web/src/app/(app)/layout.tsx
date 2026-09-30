import { AppShell } from "@/components/app-shell";
import { requireMembership } from "@/lib/auth/session";
import { navigationFor } from "@/lib/navigation";

/**
 * Área autenticada. Todas as páginas dentro de (app) exigem login e vínculo ativo com
 * uma organização. Os itens do menu vêm de `lib/navigation.ts` (fonte única), já
 * filtrados pelo papel; cada rota continua protegida no servidor.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { fullName, avatarUrl, membership } = await requireMembership();
  return (
    <AppShell
      items={navigationFor(membership.role)}
      // Nome e foto (URL assinada); sem foto, iniciais. O e-mail não aparece no menu.
      user={{ name: fullName, avatarUrl }}
      orgName={membership.orgName}
    >
      {children}
    </AppShell>
  );
}
