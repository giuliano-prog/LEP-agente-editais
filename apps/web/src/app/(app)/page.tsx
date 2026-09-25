import { can, PERMISSIONS, ROLE_LABELS, type Permission } from "@lep/core";
import { requireMembership } from "@/lib/auth/session";

const PERMISSION_LABELS: Record<Permission, string> = {
  "content.read": "Visualizar conteúdo",
  "content.edit": "Criar e editar conteúdo",
  "content.review": "Revisar e validar informações",
  "org.manage": "Configurar a organização",
  "members.manage": "Gerenciar membros e papéis",
  "ai_usage.read": "Ver custos de IA",
  "audit.read": "Ver trilha de auditoria",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ senha?: string }>;
}) {
  const { email, fullName, membership } = await requireMembership();
  const { senha } = await searchParams;

  return (
    <div className="space-y-8">
      {senha === "atualizada" && (
        <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Senha atualizada com sucesso.
        </p>
      )}

      <section className="space-y-1">
        <h1 className="text-2xl font-semibold">Olá, {fullName ?? email}</h1>
        <p className="text-zinc-600">
          Fundação da plataforma ativa. Os módulos (Captação de Recursos, Projetos…) serão
          adicionados nas próximas etapas.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card title="Organização" value={membership.orgName} />
        <Card title="Seu papel" value={ROLE_LABELS[membership.role]} />
        <Card title="E-mail" value={email} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 font-semibold">O que você pode fazer</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {(Object.keys(PERMISSIONS) as Permission[]).map((permission) => {
            const allowed = can(membership.role, permission);
            return (
              <li key={permission} className={allowed ? "text-zinc-900" : "text-zinc-400"}>
                {allowed ? "✓" : "✕"} {PERMISSION_LABELS[permission]}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}
