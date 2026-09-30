import type { Metadata } from "next";
import Link from "next/link";
import { AnalyzeEdital } from "@/components/editais/analyze-edital";
import { PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Analisar Edital" };

// Leitura do PDF (até 60 páginas) + análise no servidor.
export const maxDuration = 60;

export default async function AnalyzeEditalPage() {
  // Mesmo papel do cadastro: o PDF passa pelo Storage privado da organização.
  const { membership } = await requireMembership("editor");
  return (
    <div className="space-y-6">
      <Link href="/editais" className="inline-block text-sm text-muted hover:text-brand">
        ← Voltar para editais
      </Link>
      <PageHeader
        title="Analisar Edital"
        description="Envie o PDF de um edital para que a plataforma identifique automaticamente as principais informações, critérios de participação, prazos, valores, documentos exigidos e aderência às produções da LEP."
      />
      <AnalyzeEdital orgId={membership.orgId} />
      <p className="text-sm text-muted">
        Tem o link do edital ou prefere preencher à mão?{" "}
        <Link href="/editais/novo" className="text-brand hover:underline">
          Cadastrar por link ou manualmente
        </Link>
      </p>
    </div>
  );
}
