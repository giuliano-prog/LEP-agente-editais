"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { linesToList, sourceAdapterSchema } from "@lep/funding";
import { assertSafeUrl, UnsafeUrlError } from "@lep/ingestion";
import { requireMembership } from "@/lib/auth/session";
import { checkMonitorAccess } from "@/lib/monitor/access";
import { runMonitor } from "@/lib/monitor/run";
import { summarize, type MonitorSummary } from "@/lib/monitor/summary";
import { SUGGESTED_SOURCES } from "@/lib/monitor/suggested";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SourceActionState = {
  error?: string;
  success?: string;
  savedAt?: number;
  summary?: MonitorSummary;
};

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
  const supabase = await createClient();

  // Antes de rodar: o motor precisa enxergar as mesmas fontes ativas que a tela.
  const access = await checkMonitorAccess(supabase, membership.orgId);
  if (!access.ok)
    return { error: access.problem ?? "O motor não consegue ler as fontes. Veja o Diagnóstico." };
  if (access.engineActive === 0)
    return { error: "Nenhuma fonte ativa para verificar. Ative ou cadastre uma fonte." };

  try {
    const results = await runMonitor(createAdminClient(), {
      trigger: "manual",
      orgId: membership.orgId,
    });
    revalidatePath("/editais");
    revalidatePath("/editais/fontes");
    return { summary: summarize(results), savedAt: Date.now() };
  } catch (error) {
    console.error("Varredura manual falhou:", error instanceof Error ? error.message : error);
    return { error: "A varredura falhou. Veja o Diagnóstico." };
  }
}

const ID = z.uuid();

/** Configuração da fonte (adaptador): regras simples, validadas, sem seletores CSS. */
export async function updateSourceConfig(
  sourceId: string,
  _prev: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  const { membership } = await requireMembership("admin");
  if (!ID.safeParse(sourceId).success) return { error: "Fonte inválida." };
  const adapter = sourceAdapterSchema.safeParse({
    linkExcludes: linesToList(formData.get("link_excludes")),
    titleExcludes: linesToList(formData.get("title_excludes")),
    maxImports: Number(formData.get("max_imports") ?? 5),
    classifyPages: formData.get("classify_pages") === "on",
    allowPdfLinks: formData.get("allow_pdf_links") === "on",
  });
  if (!adapter.success) {
    const issue = adapter.error.issues[0];
    const field: Record<string, string> = {
      linkExcludes: "Ignorar endereços",
      titleExcludes: "Ignorar títulos",
      maxImports: "Máximo de importações (1 a 10)",
    };
    return { error: `${field[String(issue?.path[0])] ?? "Configuração"}: ${issue?.message}` };
  }
  const linkContains = String(formData.get("link_contains") ?? "").trim();
  if (linkContains.length > 200) return { error: "Filtro de endereço longo demais." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("edital_sources")
    .update({
      adapter_config: adapter.data,
      link_contains: linkContains || null,
      audiovisual_only: formData.get("audiovisual_only") === "on",
    })
    .eq("id", sourceId)
    .eq("org_id", membership.orgId)
    .select("id");
  if (error || !data?.length) {
    return {
      error:
        "Não foi possível salvar. Confira no Diagnóstico se a migração 20261003120000 foi aplicada.",
    };
  }
  revalidatePath("/editais/fontes");
  return {
    success: "Configuração salva. Vale a partir da próxima verificação.",
    savedAt: Date.now(),
  };
}

/** Página ignorada: apagar o registro faz a varredura avaliá-la de novo. */
export async function forgetIgnoredUrl(ignoredId: string): Promise<void> {
  const { membership } = await requireMembership("admin");
  if (!ID.safeParse(ignoredId).success) return;
  const supabase = await createClient();
  await supabase
    .from("monitor_ignored_urls")
    .delete()
    .eq("id", ignoredId)
    .eq("org_id", membership.orgId);
  revalidatePath("/editais/fontes");
}
