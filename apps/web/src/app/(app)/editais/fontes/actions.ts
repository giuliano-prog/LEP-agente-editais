"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSafeUrl, UnsafeUrlError } from "@lep/ingestion";
import { requireMembership } from "@/lib/auth/session";
import { runMonitor } from "@/lib/monitor/run";
import { SUGGESTED_SOURCES } from "@/lib/monitor/suggested";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SourceActionState = { error?: string; success?: string; savedAt?: number };

const sourceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da fonte.").max(120),
  agency: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null),
  list_url: z.string().trim().max(2000),
  link_contains: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null),
  audiovisual_only: z.boolean(),
});

export async function createSource(
  _prev: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  const { membership } = await requireMembership("admin");
  const parsed = sourceSchema.safeParse({
    name: formData.get("name") ?? "",
    agency: formData.get("agency") ?? "",
    list_url: formData.get("list_url") ?? "",
    link_contains: formData.get("link_contains") ?? "",
    audiovisual_only: formData.get("audiovisual_only") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    assertSafeUrl(parsed.data.list_url);
  } catch (error) {
    return { error: error instanceof UnsafeUrlError ? error.message : "Endereço inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("edital_sources")
    .insert({ ...parsed.data, org_id: membership.orgId });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Esta fonte já está cadastrada."
          : "Não foi possível cadastrar a fonte.",
    };
  }
  revalidatePath("/editais/fontes");
  return { success: "Fonte cadastrada.", savedAt: Date.now() };
}

export async function addSuggestedSources(): Promise<void> {
  const { membership } = await requireMembership("admin");
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("edital_sources")
    .select("list_url")
    .eq("org_id", membership.orgId);
  const known = new Set((existing ?? []).map((row) => row.list_url));
  const rows = SUGGESTED_SOURCES.filter((source) => !known.has(source.list_url)).map((source) => ({
    ...source,
    org_id: membership.orgId,
  }));
  if (rows.length > 0) await supabase.from("edital_sources").insert(rows);
  revalidatePath("/editais/fontes");
}

export async function toggleSource(sourceId: string, active: boolean): Promise<void> {
  const { membership } = await requireMembership("admin");
  const supabase = await createClient();
  await supabase
    .from("edital_sources")
    .update({ active })
    .eq("id", sourceId)
    .eq("org_id", membership.orgId);
  revalidatePath("/editais/fontes");
}

export async function deleteSource(sourceId: string): Promise<void> {
  const { membership } = await requireMembership("admin");
  const supabase = await createClient();
  await supabase.from("edital_sources").delete().eq("id", sourceId).eq("org_id", membership.orgId);
  revalidatePath("/editais/fontes");
}

/** "Verificar agora": roda a varredura só das fontes da organização do administrador. */
export async function runMonitorNow(): Promise<SourceActionState> {
  const { membership } = await requireMembership("admin");
  if (!isAdminClientConfigured()) {
    return {
      error:
        "A varredura precisa da variável SUPABASE_SECRET_KEY configurada no servidor (veja o Diagnóstico).",
    };
  }
  try {
    const results = await runMonitor(createAdminClient(), {
      trigger: "manual",
      orgId: membership.orgId,
    });
    revalidatePath("/editais");
    revalidatePath("/editais/fontes");
    if (results.length === 0) return { error: "Nenhuma fonte ativa para verificar." };
    const imported = results.reduce((total, result) => total + result.imported, 0);
    const rejected = results.reduce((total, result) => total + result.rejected, 0);
    const failed = results.filter((result) => result.status !== "ok").length;
    return {
      success: `${results.length} fonte(s) verificada(s): ${imported} edital(is) novo(s)${rejected ? `, ${rejected} descartado(s) pelas diretrizes LEP` : ""}${failed ? `, ${failed} com problema` : ""}.`,
      savedAt: Date.now(),
    };
  } catch (error) {
    console.error("Varredura manual falhou:", error instanceof Error ? error.message : error);
    return { error: "A varredura falhou. Veja o Diagnóstico." };
  }
}
