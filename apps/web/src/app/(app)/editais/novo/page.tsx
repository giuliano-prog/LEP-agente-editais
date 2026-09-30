import type { Metadata } from "next";
import Link from "next/link";
import { ManualForm } from "@/components/editais/manual-form";
import { PdfUpload } from "@/components/editais/pdf-upload";
import { UrlForm } from "@/components/editais/url-form";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { createEditalFromUpload, createEditalFromUrl } from "../actions";

export const metadata: Metadata = { title: "Cadastrar edital" };

export default async function NewEditalPage() {
  const { membership } = await requireMembership("editor");

  return (
    <div className="space-y-6">
      <Link href="/editais/analisar" className="inline-block text-sm text-muted hover:text-brand">
        ← Voltar para Analisar Edital
      </Link>
      <PageHeader
        title="Cadastrar edital"
        description="Cadastre a partir da fonte oficial. A plataforma guarda uma cópia do documento e verifica se o edital já existe. Em seguida, você preenche e revisa os campos."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <SectionTitle>1 · A partir de um link</SectionTitle>
          <p className="mb-4 text-sm text-muted">
            Página oficial do edital ou link direto para o PDF.
          </p>
          <UrlForm action={createEditalFromUrl} submitLabel="Buscar e cadastrar" />
        </Card>

        <Card>
          <SectionTitle>2 · A partir de um PDF</SectionTitle>
          <p className="mb-4 text-sm text-muted">Arquivo do edital salvo no seu computador.</p>
          <PdfUpload
            orgId={membership.orgId}
            action={createEditalFromUpload}
            submitLabel="Enviar e cadastrar"
          />
        </Card>

        <Card>
          <SectionTitle>3 · Cadastro manual</SectionTitle>
          <p className="mb-4 text-sm text-muted">
            Sem documento agora — você pode anexá-lo depois.
          </p>
          <ManualForm />
        </Card>
      </div>
    </div>
  );
}
