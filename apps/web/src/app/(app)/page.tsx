import Link from "next/link";
import { can, PERMISSIONS, ROLE_LABELS, type Permission } from "@lep/core";
import { Card, SectionTitle } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  const [editais, projetos] = await Promise.all([
    supabase.from("editais").select("*", { count: "exact", head: true }),
    supabase.from("projetos").select("*", { count: "exact", head: true }),
  ]);

  const modules = [
    {
      href: "/editais",
      title: "Editais",
      count: editais.count,
      text: "Oportunidades de financiamento e Match com os projetos.",
    },
    {
      href: "/projetos",
      title: "Projetos LEP",
      count: projetos.count,
      text: "Cadastro dos projetos usados na análise de compatibilidade.",
    },
  ];

  return (
    <div className="space-y-8">
      {senha === "atualizada" && (
        <p className="rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          Senha atualizada com sucesso.
        </p>
      )}

      <section className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-brand">{membership.orgName}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Olá, {fullName ?? email}</h1>
        <p className="text-muted">Inteligência para captação de recursos no audiovisual.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="group rounded-xl border border-line bg-card p-6 transition hover:border-brand/60"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold group-hover:text-brand">{module.title}</h2>
              <span className="text-3xl font-semibold text-brand">{module.count ?? "—"}</span>
            </div>
            <p className="mt-2 text-sm text-muted">{module.text}</p>
          </Link>
        ))}
      </section>

      <Card>
        <SectionTitle>Seu acesso — {ROLE_LABELS[membership.role]}</SectionTitle>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {(Object.keys(PERMISSIONS) as Permission[]).map((permission) => {
            const allowed = can(membership.role, permission);
            return (
              <li key={permission} className={allowed ? "text-fg" : "text-muted/60"}>
                <span className={allowed ? "text-ok" : "text-muted/60"}>{allowed ? "✓" : "✕"}</span>{" "}
                {PERMISSION_LABELS[permission]}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
