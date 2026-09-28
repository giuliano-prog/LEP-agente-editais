"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DOCUMENT_KIND_LABELS,
  editalFormToInput,
  editalInputSchema,
  isEligibilityStatus,
} from "@lep/funding";
import { requireMembership } from "@/lib/auth/session";
import { applyAutomaticSuggestions } from "@/lib/editais/extraction";
import { persistMatches } from "@/lib/editais/matches";
import {
  documentColumns,
  findDuplicate,
  IngestError,
  ingestFromUpload,
  ingestFromUrl,
  removeStored,
  type Duplicate,
  type IngestedDocument,
} from "@/lib/editais/ingest";
import { createClient } from "@/lib/supabase/server";

export type EditalActionState = {
  error?: string;
  duplicate?: Duplicate;
  success?: string;
  savedAt?: number;
};

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

function kindFrom(value: unknown) {
  return typeof value === "string" && value in DOCUMENT_KIND_LABELS ? value : "main";
}

function failure(error: unknown): EditalActionState {
  if (error instanceof IngestError) return { error: error.message };
  console.error("Erro no cadastro de edital:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível concluir o cadastro. Tente novamente." };
}

/** Cria o edital + documento principal de forma atômica e abre o formulário de revisão. */
async function createFromDocument(
  document: IngestedDocument,
  orgId: string,
): Promise<EditalActionState | string> {
  const supabase = await createClient();

  const duplicate = await findDuplicate(supabase, orgId, document);
  if (duplicate) {
    await removeStored(supabase, document.storagePath);
    return { error: "Este edital já está cadastrado na plataforma.", duplicate };
  }

  const columns = documentColumns(document);
  const { data: editalId, error } = await supabase.rpc("create_edital_with_document", {
    p_org_id: orgId,
    p_title: document.suggestedTitle,
    p_official_url: document.finalUrl ?? document.sourceUrl,
    p_kind: "main",
    p_source: columns.source,
    p_source_url: columns.source_url,
    p_final_url: columns.final_url,
    p_storage_path: columns.storage_path,
    p_file_name: columns.file_name,
    p_mime_type: columns.mime_type,
    p_size_bytes: columns.size_bytes,
    p_sha256: columns.sha256,
    p_http_status: columns.http_status,
    p_metadata: columns.metadata,
  });

  if (error || !editalId) {
    await removeStored(supabase, document.storagePath);
    console.error("Erro ao criar edital:", error?.code, error?.message);
    return { error: "Não foi possível cadastrar o edital. Tente novamente." };
  }

  await applyAutomaticSuggestions(supabase, orgId, String(editalId), document);
  await persistMatches(supabase, orgId, [String(editalId)]);
  revalidatePath("/editais");
  return editalId;
}

export async function createEditalFromUrl(
  _prev: EditalActionState,
  formData: FormData,
): Promise<EditalActionState> {
  const { membership } = await requireMembership("editor");
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "Informe o link do edital." };

  let result: EditalActionState | string;
  try {
    const supabase = await createClient();
    const document = await ingestFromUrl(supabase, membership.orgId, url);
    result = await createFromDocument(document, membership.orgId);
  } catch (error) {
    return failure(error);
  }
  if (typeof result !== "string") return result;
  redirect(`/editais/${result}/editar?novo=1`);
}

export async function createEditalFromUpload(input: {
  path: string;
  fileName: string;
}): Promise<EditalActionState> {
  const { membership } = await requireMembership("editor");

  let result: EditalActionState | string;
  try {
    const supabase = await createClient();
    const document = await ingestFromUpload(supabase, membership.orgId, input.path, input.fileName);
    result = await createFromDocument(document, membership.orgId);
  } catch (error) {
    return failure(error);
  }
  if (typeof result !== "string") return result;
  redirect(`/editais/${result}/editar?novo=1`);
}

export async function createEditalManual(
  _prev: EditalActionState,
  formData: FormData,
): Promise<EditalActionState> {
  const { membership } = await requireMembership("editor");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 3) return { error: "Informe o título do edital (mínimo de 3 caracteres)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("editais")
    .insert({ org_id: membership.orgId, title: title.slice(0, 300) })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Erro ao criar edital manual:", error?.code);
    return { error: "Não foi possível cadastrar o edital." };
  }
  revalidatePath("/editais");
  redirect(`/editais/${data.id}/editar?novo=1`);
}

/** Adiciona documento (anexo, retificação...) a um edital existente. */
async function addDocument(
  editalId: string,
  kind: string,
  document: IngestedDocument,
): Promise<EditalActionState> {
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();

  const duplicate = await findDuplicate(supabase, membership.orgId, {
    ...document,
    sourceUrl: null,
    finalUrl: null,
  });
  if (duplicate) {
    await removeStored(supabase, document.storagePath);
    return {
      error:
        duplicate.editalId === editalId
          ? "Este documento já está cadastrado neste edital."
          : "Este documento já está cadastrado em outro edital.",
      duplicate: duplicate.editalId === editalId ? undefined : duplicate,
    };
  }

  const { error } = await supabase
    .from("edital_documents")
    .insert({ ...documentColumns(document), org_id: membership.orgId, edital_id: editalId, kind });
  if (error) {
    await removeStored(supabase, document.storagePath);
    console.error("Erro ao adicionar documento:", error.code);
    return { error: "Não foi possível adicionar o documento." };
  }

  revalidatePath(`/editais/${editalId}`);
  return { success: "Documento adicionado.", savedAt: Date.now() };
}

export async function addDocumentFromUrl(
  editalId: string,
  _prev: EditalActionState,
  formData: FormData,
): Promise<EditalActionState> {
  if (!ID_PATTERN.test(editalId)) return { error: "Edital inválido." };
  const { membership } = await requireMembership("editor");
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "Informe o link do documento." };
  try {
    const supabase = await createClient();
    const document = await ingestFromUrl(supabase, membership.orgId, url);
    return await addDocument(editalId, kindFrom(formData.get("kind")), document);
  } catch (error) {
    return failure(error);
  }
}

export async function addDocumentFromUpload(
  editalId: string,
  input: { path: string; fileName: string; kind: string },
): Promise<EditalActionState> {
  if (!ID_PATTERN.test(editalId)) return { error: "Edital inválido." };
  const { membership } = await requireMembership("editor");
  try {
    const supabase = await createClient();
    const document = await ingestFromUpload(supabase, membership.orgId, input.path, input.fileName);
    return await addDocument(editalId, kindFrom(input.kind), document);
  } catch (error) {
    return failure(error);
  }
}

/** Salva o cadastro manual dos campos do edital. */
export async function updateEdital(
  editalId: string,
  _prev: EditalActionState,
  formData: FormData,
): Promise<EditalActionState> {
  if (!ID_PATTERN.test(editalId)) return { error: "Edital inválido." };
  const { membership } = await requireMembership("editor");

  const parsed = editalInputSchema.safeParse(editalFormToInput(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("editais")
    .update(parsed.data)
    .eq("id", editalId)
    .eq("org_id", membership.orgId)
    .select("id");
  if (error || !data || data.length === 0) {
    console.error("Erro ao salvar edital:", error?.code, error?.message);
    return { error: "Não foi possível salvar o edital." };
  }

  await persistMatches(supabase, membership.orgId, [editalId]);
  revalidatePath("/editais");
  revalidatePath(`/editais/${editalId}`);
  redirect(`/editais/${editalId}?salvo=1`);
}

/** Triagem: descartar (esconde e não reimporta) ou restaurar para revisão pendente. */
export async function setEditalTriage(
  editalId: string,
  decision: "discarded" | "pending",
): Promise<void> {
  if (!ID_PATTERN.test(editalId)) return;
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();
  const { error } = await supabase
    .from("editais")
    .update({ review_status: decision })
    .eq("id", editalId)
    .eq("org_id", membership.orgId);
  if (error) console.error("Erro na triagem do edital:", error.code);
  else await persistMatches(supabase, membership.orgId, [editalId]);
  revalidatePath("/editais");
  revalidatePath(`/editais/${editalId}`);
}

export type EligibilityActionState = { error?: string; success?: string };

/**
 * Elegibilidade definida pela equipe (Diretoria/Administrador). "Não elegível" só
 * existe por decisão humana e exige motivo. A varredura não sobrescreve (source = manual).
 */
export async function setEditalEligibility(
  editalId: string,
  _prev: EligibilityActionState,
  formData: FormData,
): Promise<EligibilityActionState> {
  if (!ID_PATTERN.test(editalId)) return { error: "Edital inválido." };
  const { membership } = await requireMembership("editor");
  const status = formData.get("eligibility_status");
  const reason = String(formData.get("eligibility_reason") ?? "").trim();
  if (!isEligibilityStatus(status)) return { error: "Selecione a elegibilidade." };
  if (reason.length < 5) return { error: "Explique o motivo (mínimo 5 caracteres)." };
  if (reason.length > 1000) return { error: "Motivo longo demais (máximo 1000 caracteres)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("editais")
    .update({
      eligibility_status: status,
      eligibility_reason: reason,
      eligibility_source: "manual",
      eligibility_checked_at: new Date().toISOString(),
    })
    .eq("id", editalId)
    .eq("org_id", membership.orgId)
    .select("id");
  if (error || !data?.length) {
    console.error("Erro ao salvar elegibilidade:", error?.code);
    return {
      error:
        "Não foi possível salvar. Confira no Diagnóstico se a migração de elegibilidade foi aplicada.",
    };
  }
  await persistMatches(supabase, membership.orgId, [editalId]);
  revalidatePath("/editais");
  revalidatePath(`/editais/${editalId}`);
  return { success: "Elegibilidade atualizada pela equipe." };
}

/**
 * Possível duplicado (etapa 8): "não é duplicado" limpa o aviso; "é duplicado"
 * descarta este edital na triagem, com o motivo (link para o original). Nada é apagado.
 */
export async function resolveDuplicate(
  editalId: string,
  decision: "not_duplicate" | "duplicate",
): Promise<void> {
  if (!ID_PATTERN.test(editalId)) return;
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();
  const { data: edital } = await supabase
    .from("editais")
    .select("id, title, official_url, possible_duplicate_of")
    .eq("id", editalId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!edital?.possible_duplicate_of) return;

  if (decision === "not_duplicate") {
    await supabase
      .from("editais")
      .update({ possible_duplicate_of: null, possible_duplicate_reason: null })
      .eq("id", editalId)
      .eq("org_id", membership.orgId);
  } else {
    const { data: original } = await supabase
      .from("editais")
      .select("id, title")
      .eq("id", edital.possible_duplicate_of)
      .eq("org_id", membership.orgId)
      .maybeSingle();
    if (!original) return;
    await supabase
      .from("editais")
      .update({
        review_status: "discarded",
        triage_reason: `Duplicado de: ${original.title ?? "edital já cadastrado"}`.slice(0, 500),
      })
      .eq("id", editalId)
      .eq("org_id", membership.orgId);
    revalidatePath(`/editais/${original.id}`);
  }
  await persistMatches(supabase, membership.orgId, [editalId]);
  revalidatePath("/editais");
  revalidatePath(`/editais/${editalId}`);
}

/** Recalcula e grava o Match v2 deste edital com os projetos atuais (Diretoria/Admin). */
export async function recalculateMatches(editalId: string): Promise<void> {
  if (!ID_PATTERN.test(editalId)) return;
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();
  await persistMatches(supabase, membership.orgId, [editalId]);
  revalidatePath(`/editais/${editalId}`);
}
