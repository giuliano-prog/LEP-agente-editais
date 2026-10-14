import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@lep/core";
import {
  ORG_DOCUMENT_CATEGORY_LABELS,
  ORG_DOCUMENT_SCOPE_LABELS,
  toOrgDocument,
} from "@lep/funding";
import { DbErrorNotice } from "@/components/db-error-notice";
import { Badge, PageHeader } from "@/components/ui";
import { AcervoUpload } from "@/components/workspace/acervo-upload";
import { OpenDocument } from "@/components/workspace/open-document";
import { S } from "@/components/workspace/styles";
import { requireMembership } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { deleteOrgDocument, updateOrgDocumentValidity } from "./actions";

export const metadata: Metadata = { title: "Acervo de documentos" };

/** Hoje e daqui a 30 dias (AAAA-MM-DD, horário de Brasília) para destacar validades. */
function validityWindow() {
  const iso = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
  const now = new Date();
  return { today: iso(now), soon: iso(new Date(now.getTime() + 30 * 86_400_000)) };
}

/**
 * Acervo de documentos da LEP (produtora) e das produções, reutilizado nas
 * Áreas de Trabalho dos editais (ADR-0026). Validade controlada (certidões).
 */
export default async function AcervoPage() {
  const { membership } = await requireMembership();
  const canEdit = can(membership.role, "content.edit");
  const supabase = await createClient();
  const [documentsQuery, projectsQuery] = await Promise.all([
    supabase
      .from("org_documents")
      .select("*")
      .eq("org_id", membership.orgId)
      .order("scope", { ascending: true })
      .order("title", { ascending: true }),
    supabase.from("projetos").select("id, title").eq("org_id", membership.orgId).order("title"),
  ]);
  const documents = (documentsQuery.data ?? []).map((row) => toOrgDocument(row));
  const projects = projectsQuery.data ?? [];
  const { today, soon } = validityWindow();

  const groups = [
    {
      key: "company",
      title: ORG_DOCUMENT_SCOPE_LABELS.company,
      list: documents.filter((doc) => doc.scope === "company"),
    },
    ...projects
      .map((project) => ({
        key: project.id,
        title: `Produção: ${project.title}`,
        list: documents.filter((doc) => doc.projetoId === project.id),
      }))
      .filter((group) => group.list.length > 0),
  ];

  return (
    <div className="space-y-6">
      <Link href="/editais" className="inline-block text-sm text-muted hover:text-brand">
        ← Voltar para editais
      </Link>
      <PageHeader
        title="Acervo de documentos"
        description="Documentos da LEP e das produções usados nas inscrições: certidões, contrato social, cessões de direitos, portfólio. A validade é conferida nas Áreas de Trabalho dos editais."
      />
      <DbErrorNotice
        error={documentsQuery.error}
        isAdmin={can(membership.role, "org.manage")}
        context="o acervo"
      />

      {canEdit && !documentsQuery.error && (
        <section className={`${S.card} space-y-4 p-5`} aria-labelledby="novo-documento">
          <h2 id="novo-documento" className="font-medium text-brand">
            Cadastrar documento
          </h2>
          <AcervoUpload orgId={membership.orgId} productions={projects} />
        </section>
      )}

      {!documentsQuery.error && documents.length === 0 && (
        <p className="rounded-xl border border-dashed border-line bg-card/50 p-8 text-center text-sm text-muted">
          Nenhum documento no acervo ainda.
        </p>
      )}

      {groups
        .filter((group) => group.list.length > 0)
        .map((group) => (
          <section key={group.key} className="space-y-2">
            <h2 className={S.eyebrow}>{group.title}</h2>
            <ul className={`${S.card} divide-y divide-line px-5`}>
              {group.list.map((doc) => {
                const expired = doc.validUntil !== null && doc.validUntil < today;
                const expiring = !expired && doc.validUntil !== null && doc.validUntil <= soon;
                return (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">{doc.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <Badge>{ORG_DOCUMENT_CATEGORY_LABELS[doc.category]}</Badge>
                        {doc.validUntil ? (
                          <Badge tone={expired ? "bad" : expiring ? "warn" : "ok"}>
                            {expired ? "Vencido em" : "Válido até"} {formatDate(doc.validUntil)}
                          </Badge>
                        ) : (
                          <span>Sem validade registrada</span>
                        )}
                        {doc.filePath && <OpenDocument documentId={doc.id} />}
                        {doc.externalUrl && (
                          <a
                            href={doc.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand hover:underline"
                          >
                            Link ↗
                          </a>
                        )}
                      </div>
                      {doc.notes && <p className="text-xs text-muted">{doc.notes}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap items-end gap-2">
                        <form
                          action={updateOrgDocumentValidity.bind(null, doc.id)}
                          className="flex items-end gap-1.5"
                        >
                          <label className="text-xs text-muted">
                            <span className="sr-only">Nova validade de {doc.title}</span>
                            <input
                              type="date"
                              name="valid_until"
                              defaultValue={doc.validUntil ?? ""}
                              className={`${S.control} py-1 text-xs`}
                            />
                          </label>
                          <button className={S.small}>Atualizar validade</button>
                        </form>
                        <form action={deleteOrgDocument.bind(null, doc.id)}>
                          <button className={S.danger}>Excluir</button>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
