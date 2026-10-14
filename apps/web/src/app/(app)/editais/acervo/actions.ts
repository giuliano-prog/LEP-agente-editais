"use server";

import { revalidatePath } from "next/cache";
import { isPdf, sha256 } from "@lep/ingestion";
import { requireMembership } from "@/lib/auth/session";
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES } from "@/lib/editais/constants";
import { removeStored } from "@/lib/editais/ingest";
import { isValidAcervoPath, parseOrgDocumentForm, UUID } from "@/lib/editais/workspace-form";
import { createClient } from "@/lib/supabase/server";

export type AcervoState = { error?: string; success?: string; savedAt?: number };

/**
 * Cadastra um documento no acervo da LEP (produtora ou produção). O PDF, quando há,
 * já foi enviado pelo navegador ao bucket privado em <org_id>/acervo/<uuid>.pdf;
 * aqui o servidor confere caminho, tamanho e assinatura e calcula o SHA-256.
 */
export async function createOrgDocument(formData: FormData): Promise<AcervoState> {
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();
  const parsed = parseOrgDocumentForm(formData);
  const path = String(formData.get("file_path") ?? "").trim();
  const fileName = String(formData.get("file_name") ?? "").trim();

  const cleanup = async () => {
    if (path && isValidAcervoPath(membership.orgId, path)) await removeStored(supabase, path);
  };
  if (!parsed.ok) {
    await cleanup();
    return { error: parsed.error };
  }

  let file: {
    file_path: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
  } | null = null;
  if (path) {
    if (!isValidAcervoPath(membership.orgId, path)) return { error: "Arquivo enviado inválido." };
    const download = await supabase.storage.from(DOCUMENTS_BUCKET).download(path);
    if (download.error || !download.data) {
      return { error: "Não foi possível ler o arquivo enviado. Tente novamente." };
    }
    const body = Buffer.from(await download.data.arrayBuffer());
    if (body.byteLength > MAX_DOCUMENT_BYTES || !isPdf(body)) {
      await cleanup();
      return { error: "Envie um PDF válido de até 25 MB." };
    }
    file = {
      file_path: path,
      file_name: fileName.replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(0, 200) || "documento.pdf",
      mime_type: "application/pdf",
      size_bytes: body.byteLength,
      sha256: sha256(body),
    };
  }
  if (!file && !parsed.value.external_url && !parsed.value.notes) {
    return { error: "Anexe o PDF, informe um link ou registre onde o documento está." };
  }

  const { error } = await supabase
    .from("org_documents")
    .insert({ ...parsed.value, ...(file ?? {}), org_id: membership.orgId });
  if (error) {
    await cleanup();
    console.error("Erro ao cadastrar documento do acervo:", error.code, error.message);
    return { error: "Não foi possível cadastrar o documento. Tente novamente." };
  }
  revalidatePath("/editais/acervo");
  return { success: "Documento cadastrado no acervo.", savedAt: Date.now() };
}

export async function updateOrgDocumentValidity(
  documentId: string,
  formData: FormData,
): Promise<void> {
  if (!UUID.test(documentId)) return;
  const { membership } = await requireMembership("editor");
  const value = String(formData.get("valid_until") ?? "");
  const supabase = await createClient();
  await supabase
    .from("org_documents")
    .update({ valid_until: /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null })
    .eq("id", documentId)
    .eq("org_id", membership.orgId);
  revalidatePath("/editais/acervo");
}

/** Exclui o registro e o arquivo. Itens do checklist que o usavam ficam sem documento. */
export async function deleteOrgDocument(documentId: string): Promise<void> {
  if (!UUID.test(documentId)) return;
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_documents")
    .delete()
    .eq("id", documentId)
    .eq("org_id", membership.orgId)
    .select("file_path")
    .maybeSingle();
  if (data?.file_path && isValidAcervoPath(membership.orgId, data.file_path)) {
    await removeStored(supabase, data.file_path);
  }
  revalidatePath("/editais/acervo");
}

/** Link temporário (5 min) para abrir o PDF do acervo. */
export async function openOrgDocument(
  documentId: string,
): Promise<{ url?: string; error?: string }> {
  if (!UUID.test(documentId)) return { error: "Documento inválido." };
  const { membership } = await requireMembership();
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_documents")
    .select("file_path")
    .eq("id", documentId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!data?.file_path) return { error: "Documento sem arquivo." };
  const signed = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(data.file_path, 300);
  return signed.data?.signedUrl
    ? { url: signed.data.signedUrl }
    : { error: "Não foi possível abrir." };
}
