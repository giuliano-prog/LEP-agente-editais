"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Database } from "@lep/db";
import { linesToList, sourceAdapterSchema } from "@lep/funding";
import { assertSafeUrl, UnsafeUrlError } from "@lep/ingestion";
import { requireMembership } from "@/lib/auth/session";
import { checkMonitorAccess } from "@/lib/monitor/access";
import {
  importUncertainCandidate,
  runWebDiscovery,
  type DiscoveryResult,
} from "@/lib/discovery/run";
import { catalogEntry } from "@/lib/monitor/catalog";
import { previewSource, runMonitor, type SourcePreview } from "@/lib/monitor/run";
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

type SourceInsert = Database["core"]["Tables"]["edital_sources"]["Insert"];

/**
 * Cadastra fontes registrando a origem (manual, sugerida, catálogo, descoberta web).
 * Antes da migração 20261008120000 a coluna não existe: cadastra sem a origem.
 */
async function insertSources(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: SourceInsert[],
) {
  const first = await supabase.from("edital_sources").insert(rows);
  if (first.error?.code === "PGRST204" || first.error?.code === "42703") {
    return supabase.from("edital_sources").insert(
      rows.map((row) => {
        const copy = { ...row };
        delete copy.origin;
        return copy;
      }),
    );
  }
  return first;
}

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
    origin: "suggested",
  }));
  if (rows.length > 0) await insertSources(supabase, rows);
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

export type PreviewState = { error?: string; success?: string; preview?: SourcePreview };

const catalogSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da fonte.").max(120),
  agency: z.string().trim().max(200),
  list_url: z.string().trim().min(8, "Cole o endereço da página oficial de editais.").max(2000),
});

function parseCatalogForm(key: string, formData: FormData) {
  const entry = catalogEntry(key);
  if (!entry) return { error: "Fonte do catálogo não encontrada." } as const;
  const parsed = catalogSchema.safeParse({
    name: formData.get("name") ?? entry.name,
    agency: formData.get("agency") ?? entry.agency,
    list_url: formData.get("list_url") ?? "",
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." } as const;
  try {
    assertSafeUrl(parsed.data.list_url);
  } catch (error) {
    return {
      error: error instanceof UnsafeUrlError ? error.message : "Endereço inválido.",
    } as const;
  }
  return { entry, data: parsed.data } as const;
}

/** Catálogo (etapa 11): testa o endereço colado com a configuração da fonte, sem gravar. */
export async function testCatalogSource(
  key: string,
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  await requireMembership("admin");
  const form = parseCatalogForm(key, formData);
  if ("error" in form) return { error: form.error };
  const preview = await previewSource({
    list_url: form.data.list_url,
    audiovisual_only: form.entry.audiovisualOnly,
    link_contains: null,
    adapter_config: form.entry.adapter,
  });
  return { preview };
}

/** Catálogo: cadastra a fonte PAUSADA (ativar depois de testar). */
export async function addCatalogSource(
  key: string,
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const { membership } = await requireMembership("admin");
  const form = parseCatalogForm(key, formData);
  if ("error" in form) return { error: form.error };
  const supabase = await createClient();
  const { error } = await insertSources(supabase, [
    {
      org_id: membership.orgId,
      name: form.data.name,
      agency: form.data.agency || null,
      list_url: form.data.list_url,
      audiovisual_only: form.entry.audiovisualOnly,
      link_contains: null,
      adapter_config: form.entry.adapter,
      active: false,
      origin: "catalog",
    },
  ]);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Esta fonte já está cadastrada."
          : "Não foi possível cadastrar. Confira no Diagnóstico se as migrações foram aplicadas.",
    };
  }
  revalidatePath("/editais/fontes");
  return { success: "Fonte cadastrada PAUSADA. Teste e, se estiver certa, clique em “Reativar”." };
}

/** "Testar fonte" de uma fonte já cadastrada (sem gravar nada). */
export async function testExistingSource(sourceId: string): Promise<PreviewState> {
  const { membership } = await requireMembership("admin");
  if (!ID.safeParse(sourceId).success) return { error: "Fonte inválida." };
  const supabase = await createClient();
  const { data: source } = await supabase
    .from("edital_sources")
    .select("*")
    .eq("id", sourceId)
    .eq("org_id", membership.orgId)
    .maybeSingle();
  if (!source) return { error: "Fonte não encontrada." };
  return { preview: await previewSource(source) };
}

/** Fonte favorita ⭐: destaque e prioridade (não limita a descoberta geral). */
export async function toggleFavorite(sourceId: string, favorite: boolean): Promise<void> {
  const { membership } = await requireMembership("admin");
  if (!ID.safeParse(sourceId).success) return;
  const supabase = await createClient();
  await supabase
    .from("edital_sources")
    .update({ is_favorite: favorite })
    .eq("id", sourceId)
    .eq("org_id", membership.orgId);
  revalidatePath("/editais/fontes");
}

export type DiscoveryActionState = { error?: string; result?: DiscoveryResult; savedAt?: number };

/** "Buscar novas oportunidades": descoberta web só da organização do administrador. */
export async function runDiscoveryNow(): Promise<DiscoveryActionState> {
  const { membership } = await requireMembership("admin");
  try {
    const [result] = await runWebDiscovery(createAdminClient(), {
      trigger: "manual",
      orgId: membership.orgId,
    });
    revalidatePath("/editais");
    revalidatePath("/editais/fontes");
    if (!result) return { error: "Nada foi executado." };
    if (result.status === "not_configured") return { error: result.error, result };
    return { result, savedAt: Date.now() };
  } catch (error) {
    console.error("Descoberta web manual falhou:", error instanceof Error ? error.message : error);
    return { error: "A descoberta web falhou. Veja o Diagnóstico." };
  }
}

/** Candidato incerto confirmado como audiovisual: entra pelo mesmo pipeline (revisão pendente). */
export async function importDiscoveryCandidate(candidateId: string): Promise<void> {
  const { membership } = await requireMembership("admin");
  if (!ID.safeParse(candidateId).success) return;
  const outcome = await importUncertainCandidate(
    createAdminClient(),
    membership.orgId,
    candidateId,
  );
  if (!outcome.ok) console.error("Descoberta: candidato não importado:", outcome.message);
  revalidatePath("/editais");
  revalidatePath("/editais/fontes");
}

/** Candidato incerto descartado por um administrador (continua só no registro técnico). */
export async function dismissDiscoveryCandidate(candidateId: string): Promise<void> {
  const { membership } = await requireMembership("admin");
  if (!ID.safeParse(candidateId).success) return;
  const supabase = await createClient();
  await supabase
    .from("discovery_candidates")
    .update({ status: "dismissed", status_reason: "descartado por um administrador" })
    .eq("id", candidateId)
    .eq("org_id", membership.orgId)
    .eq("status", "uncertain");
  revalidatePath("/editais/fontes");
}

const discoveredSourceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da fonte.").max(120),
  agency: z.string().trim().max(200),
  list_url: z.string().trim().min(8, "Informe a página de listagem de editais.").max(2000),
});

/**
 * Nova fonte identificada pela descoberta web → cadastrada PAUSADA (origem
 * web_discovery). O administrador confere a página de listagem, testa e ativa.
 */
export async function addDiscoveredSource(
  _prev: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  const { membership } = await requireMembership("admin");
  const parsed = discoveredSourceSchema.safeParse({
    name: formData.get("name") ?? "",
    agency: formData.get("agency") ?? "",
    list_url: formData.get("list_url") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    assertSafeUrl(parsed.data.list_url);
  } catch (error) {
    return { error: error instanceof UnsafeUrlError ? error.message : "Endereço inválido." };
  }
  const supabase = await createClient();
  const { error } = await insertSources(supabase, [
    {
      org_id: membership.orgId,
      name: parsed.data.name,
      agency: parsed.data.agency || null,
      list_url: parsed.data.list_url,
      // Instituição geral: a varredura exige termos de audiovisual nos links.
      audiovisual_only: false,
      active: false,
      origin: "web_discovery",
    },
  ]);
  if (error) {
    return {
      error:
        error.code === "23505" ? "Esta fonte já está cadastrada." : "Não foi possível cadastrar.",
    };
  }
  revalidatePath("/editais/fontes");
  return {
    success: "Fonte cadastrada PAUSADA. Use “Testar fonte” e, se estiver certa, “Reativar”.",
    savedAt: Date.now(),
  };
}
