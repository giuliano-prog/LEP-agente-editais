import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "Adicionar Produção Concluída" };

export default async function NewProductionPage() {
  // Mesmo papel do cadastro (content.edit); o RLS confere de novo no banco.
  await requireMembership("editor");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/projetos" className="inline-block text-sm text-muted hover:text-brand">
        ← Produções Concluídas
      </Link>
      <PageHeader
        title="Adicionar Produção Concluída"
        description="Dados usados no histórico da LEP e no Match com os editais. Visíveis somente para a equipe da LEP."
      />
      <Card>
        <ProjectForm />
      </Card>
    </div>
  );
}
