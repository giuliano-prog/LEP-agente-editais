import { notFound, redirect } from "next/navigation";
import { requireMembership } from "@/lib/auth/session";
import { DOCUMENTS_BUCKET } from "@/lib/editais/constants";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/;

/**
 * Abre um documento guardado: gera um link temporário (60 s) do Storage privado.
 * Páginas HTML capturadas são sempre baixadas (nunca exibidas), por segurança.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  if (!UUID.test(docId)) notFound();
  const { membership } = await requireMembership();

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("edital_documents")
    .select("storage_path, mime_type, file_name")
    .eq("id", docId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!document) notFound();

  const isHtml = document.mime_type === "text/html";
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(document.storage_path, 60, {
      download: isHtml ? "pagina-capturada.html" : false,
    });
  if (error || !data) notFound();

  redirect(data.signedUrl);
}
