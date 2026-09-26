import { DOCUMENT_KIND_LABELS } from "@lep/funding";
import { addDocumentFromUpload, addDocumentFromUrl } from "@/app/(app)/editais/actions";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/format";
import { AddFoundPdfButton } from "./add-found-pdf";
import { PdfUpload } from "./pdf-upload";
import { UrlForm } from "./url-form";

export type EditalDocument = {
  id: string;
  kind: string;
  source: string;
  source_url: string | null;
  final_url: string | null;
  file_name: string | null;
  mime_type: string;
  size_bytes: number | null;
  sha256: string;
  created_at: string;
  metadata: unknown;
};

type PdfLink = { label: string; url: string };

function pdfLinksOf(metadata: unknown): PdfLink[] {
  const links = (metadata as { pdf_links?: unknown })?.pdf_links;
  if (!Array.isArray(links)) return [];
  return links.filter(
    (link): link is PdfLink =>
      typeof link?.url === "string" &&
      /^https?:\/\//.test(link.url) &&
      typeof link?.label === "string",
  );
}

function documentName(document: EditalDocument): string {
  if (document.file_name) return document.file_name;
  const title = (document.metadata as { page_title?: unknown })?.page_title;
  if (typeof title === "string" && title) return title;
  return document.final_url ?? document.source_url ?? "Documento";
}

/** Documentos guardados do edital + inclusão de anexos/retificações (editor). */
export function DocumentsSection({
  editalId,
  orgId,
  documents,
  canEdit,
}: {
  editalId: string;
  orgId: string;
  documents: EditalDocument[];
  canEdit: boolean;
}) {
  const known = new Set(documents.flatMap((document) => [document.source_url, document.final_url]));
  const found = documents
    .flatMap((document) => pdfLinksOf(document.metadata))
    .filter(
      (link, index, all) =>
        !known.has(link.url) && all.findIndex((other) => other.url === link.url) === index,
    );

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Documentos do edital</h2>
        <p className="text-xs text-muted">
          Cópias originais guardadas com hash SHA-256 (rastreabilidade).
        </p>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted">Nenhum documento guardado ainda.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      document.kind === "rectification"
                        ? "warn"
                        : document.kind === "main"
                          ? "brand"
                          : "neutral"
                    }
                  >
                    {DOCUMENT_KIND_LABELS[document.kind as keyof typeof DOCUMENT_KIND_LABELS] ??
                      document.kind}
                  </Badge>
                  <span className="truncate text-sm font-medium">{documentName(document)}</span>
                </div>
                <p className="text-xs text-muted">
                  {document.mime_type === "application/pdf" ? "PDF" : "Página web capturada"} ·{" "}
                  {formatBytes(document.size_bytes)} ·{" "}
                  {document.source === "url" ? "via link" : "enviado"} em{" "}
                  {formatDate(document.created_at)} ·{" "}
                  <span title={document.sha256} className="font-mono">
                    {document.sha256.slice(0, 12)}
                  </span>
                </p>
                {document.final_url && (
                  <a
                    href={document.final_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs text-brand hover:underline"
                  >
                    {document.final_url} ↗
                  </a>
                )}
              </div>
              <a
                href={`/editais/documentos/${document.id}`}
                target="_blank"
                rel="noopener"
                className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm hover:border-brand hover:text-brand"
              >
                {document.mime_type === "text/html" ? "Baixar cópia" : "Abrir PDF"}
              </a>
            </li>
          ))}
        </ul>
      )}

      {found.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            PDFs encontrados na página oficial ({found.length})
          </h3>
          <p className="text-xs text-muted">
            Links detectados na página capturada. Confira antes de adicionar.
          </p>
          <ul className="space-y-2">
            {found.map((link) => (
              <li
                key={link.url}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-2"
              >
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-sm hover:text-brand"
                >
                  {link.label}
                </a>
                {canEdit && <AddFoundPdfButton editalId={editalId} url={link.url} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <details className="group rounded-lg border border-line">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-brand marker:hidden">
            + Adicionar documento (anexo, retificação, resultado…)
          </summary>
          <div className="grid gap-6 border-t border-line p-4 md:grid-cols-2">
            <div className="space-y-2">
              <SectionTitle>Por link</SectionTitle>
              <UrlForm
                action={addDocumentFromUrl.bind(null, editalId)}
                submitLabel="Buscar e adicionar"
                withKind
              />
            </div>
            <div className="space-y-2">
              <SectionTitle>Por arquivo PDF</SectionTitle>
              <PdfUpload
                orgId={orgId}
                action={addDocumentFromUpload.bind(null, editalId)}
                submitLabel="Enviar e adicionar"
                withKind
              />
            </div>
          </div>
        </details>
      )}
    </Card>
  );
}
