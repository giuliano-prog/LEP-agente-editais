"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ItemStatus, isItemStatus } from "@lep/funding";
import { requireMembership } from "@/lib/auth/session";
import { syncChecklist } from "@/lib/editais/workspace-sync";
import { parseItemForm, parseWorkspaceForm, UUID } from "@/lib/editais/workspace-form";
import { createClient } from "@/lib/supabase/server";

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

const pagePath = (editalId: string) => `/editais/${editalId}/trabalho`;

function back(editalId: string, params: Record<string, string>, anchor?: string): never {
  const query = new URLSearchParams(params).toString();
  redirect(`${pagePath(editalId)}${query ? `?${query}` : ""}${anchor ? `#${anchor}` : ""}`);
}

function fail(editalId: string, message: string, anchor?: string): never {
  back(editalId, { erro: message.slice(0, 200) }, anchor);
}

/** Área de trabalho do edital (com a organização conferida). */
async function workspaceOf(editalId: string) {
  if (!ID_PATTERN.test(editalId)) redirect("/editais");
  const { membership } = await requireMembership("editor");
  const supabase = await createClient();
  const { data } = await supabase
    .from("edital_workspaces")
    .select("id, org_id")
    .eq("edital_id", editalId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  return { supabase, membership, workspace: data };
}

export async function createWorkspace(editalId: string): Promise<void> {
  const { supabase, membership, workspace } = await workspaceOf(editalId);
  let workspaceId = workspace?.id ?? null;
  if (!workspaceId) {
    const { data, error } = await supabase
      .from("edital_workspaces")
      .insert({ org_id: membership.orgId, edital_id: editalId })
      .select("id")
      .single();
    if (error || !data) {
      console.error("Erro ao criar área de trabalho:", error?.code, error?.message);
      fail(
        editalId,
        "Não foi possível criar a área de trabalho. Verifique se as migrações foram aplicadas.",
      );
    }
    workspaceId = data.id;
  }
  let result: { added: number; notes: string[] };
  try {
    result = await syncChecklist(supabase, membership.orgId, editalId, workspaceId);
  } catch (error) {
    console.error("Erro ao gerar checklist:", error instanceof Error ? error.message : error);
    fail(
      editalId,
      "Área criada, mas o checklist não pôde ser gerado. Tente “Atualizar checklist do edital”.",
    );
  }
  revalidatePath(pagePath(editalId));
  back(editalId, {
    ok: `Área de trabalho criada com ${result.added} item(ns) gerado(s) a partir do edital.`,
    ...(result.notes.length ? { aviso: result.notes.join(" ") } : {}),
  });
}

export async function regenerateChecklist(editalId: string): Promise<void> {
  const { supabase, membership, workspace } = await workspaceOf(editalId);
  if (!workspace) fail(editalId, "Crie a área de trabalho primeiro.");
  let result: { added: number; notes: string[] };
  try {
    result = await syncChecklist(supabase, membership.orgId, editalId, workspace.id);
  } catch (error) {
    console.error("Erro ao atualizar checklist:", error instanceof Error ? error.message : error);
    fail(editalId, "Não foi possível atualizar o checklist agora. Tente novamente.");
  }
  revalidatePath(pagePath(editalId));
  back(
    editalId,
    {
      ok:
        result.added > 0
          ? `Checklist atualizado: ${result.added} item(ns) novo(s). O trabalho já feito foi mantido.`
          : "Checklist conferido: nenhum item novo no edital.",
      ...(result.notes.length ? { aviso: result.notes.join(" ") } : {}),
    },
    "checklist",
  );
}

export async function saveWorkspace(editalId: string, formData: FormData): Promise<void> {
  const { supabase, membership, workspace } = await workspaceOf(editalId);
  if (!workspace) fail(editalId, "Crie a área de trabalho primeiro.");
  const parsed = parseWorkspaceForm(formData);
  const anchor = String(formData.get("anchor") ?? "") || undefined;
  if (!parsed.ok) fail(editalId, parsed.error, anchor);
  const { error } = await supabase
    .from("edital_workspaces")
    .update(parsed.value)
    .eq("id", workspace.id)
    .eq("org_id", membership.orgId);
  if (error) {
    console.error("Erro ao salvar área de trabalho:", error.code, error.message);
    fail(editalId, "Não foi possível salvar. Confira os dados e tente novamente.", anchor);
  }
  revalidatePath(pagePath(editalId));
  back(editalId, { ok: "Alterações salvas." }, anchor);
}

export async function addItem(editalId: string, formData: FormData): Promise<void> {
  const { supabase, membership, workspace } = await workspaceOf(editalId);
  if (!workspace) fail(editalId, "Crie a área de trabalho primeiro.");
  const parsed = parseItemForm(formData, true);
  if (!parsed.ok) fail(editalId, parsed.error, "checklist");
  const { data: last } = await supabase
    .from("edital_workspace_items")
    .select("position")
    .eq("workspace_id", workspace.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("edital_workspace_items")
    .insert({
      ...parsed.value,
      title: parsed.value.title ?? "Item",
      org_id: membership.orgId,
      workspace_id: workspace.id,
      origin: "manual",
      position: (last?.position ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Erro ao adicionar item:", error?.code, error?.message);
    fail(editalId, "Não foi possível adicionar o item.", "checklist");
  }
  revalidatePath(pagePath(editalId));
  back(editalId, { ok: "Item adicionado ao checklist." }, `item-${data.id}`);
}

export async function saveItem(
  editalId: string,
  itemId: string,
  formData: FormData,
): Promise<void> {
  if (!UUID.test(itemId)) fail(editalId, "Item inválido.");
  const { supabase, membership, workspace } = await workspaceOf(editalId);
  if (!workspace) fail(editalId, "Crie a área de trabalho primeiro.");
  const requested = String(formData.get("anchor") ?? "");
  const anchor = /^[a-z0-9-]{1,80}$/.test(requested) ? requested : `item-${itemId}`;
  const parsed = parseItemForm(formData);
  if (!parsed.ok) fail(editalId, parsed.error, anchor);
  const { error } = await supabase
    .from("edital_workspace_items")
    .update(parsed.value)
    .eq("id", itemId)
    .eq("workspace_id", workspace.id)
    .eq("org_id", membership.orgId);
  if (error) {
    console.error("Erro ao salvar item:", error.code, error.message);
    fail(
      editalId,
      "Não foi possível salvar o item. O responsável precisa ser um membro ativo e o documento, do acervo da LEP.",
      anchor,
    );
  }
  revalidatePath(pagePath(editalId));
  back(editalId, { ok: "Item salvo." }, anchor);
}

export async function setItemStatus(
  editalId: string,
  itemId: string,
  status: ItemStatus,
  anchor?: string,
): Promise<void> {
  if (!UUID.test(itemId) || !isItemStatus(status)) fail(editalId, "Dados inválidos.");
  const { supabase, membership, workspace } = await workspaceOf(editalId);
  if (!workspace) fail(editalId, "Crie a área de trabalho primeiro.");
  const { error } = await supabase
    .from("edital_workspace_items")
    .update({ status })
    .eq("id", itemId)
    .eq("workspace_id", workspace.id)
    .eq("org_id", membership.orgId);
  const target = anchor && /^[a-z0-9-]{1,80}$/.test(anchor) ? anchor : `item-${itemId}`;
  if (error) fail(editalId, "Não foi possível atualizar o status.", target);
  revalidatePath(pagePath(editalId));
  back(editalId, {}, target);
}

/** Só itens manuais são excluídos; os gerados do edital viram "Não se aplica". */
export async function deleteItem(editalId: string, itemId: string): Promise<void> {
  if (!UUID.test(itemId)) fail(editalId, "Item inválido.");
  const { supabase, membership, workspace } = await workspaceOf(editalId);
  if (!workspace) fail(editalId, "Crie a área de trabalho primeiro.");
  const { error } = await supabase
    .from("edital_workspace_items")
    .delete()
    .eq("id", itemId)
    .eq("workspace_id", workspace.id)
    .eq("org_id", membership.orgId)
    .eq("origin", "manual");
  if (error) fail(editalId, "Não foi possível excluir o item.", "checklist");
  revalidatePath(pagePath(editalId));
  back(editalId, { ok: "Item excluído." }, "checklist");
}

/** Excluir a área de trabalho inteira: somente ADM (RLS também exige). */
export async function deleteWorkspace(editalId: string, formData: FormData): Promise<void> {
  if (!ID_PATTERN.test(editalId)) redirect("/editais");
  const { membership } = await requireMembership("admin");
  if (String(formData.get("confirm") ?? "").trim() !== "EXCLUIR") {
    fail(editalId, "Digite EXCLUIR para confirmar.", "zona-admin");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edital_workspaces")
    .delete()
    .eq("edital_id", editalId)
    .eq("org_id", membership.orgId);
  if (error) fail(editalId, "Não foi possível excluir a área de trabalho.", "zona-admin");
  revalidatePath(pagePath(editalId));
  redirect(`/editais/${editalId}`);
}
