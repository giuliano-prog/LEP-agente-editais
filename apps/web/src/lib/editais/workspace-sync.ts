import "server-only";

import { buildChecklistSeeds, extractWorkspaceRules, newSeeds, toEdital } from "@lep/funding";
import type { Json } from "@lep/db";
import type { createClient } from "@/lib/supabase/server";
import { loadEditalText } from "./workspace-source";

/**
 * Lê o edital (documentos guardados ou cadastro), extrai as regras e ACRESCENTA ao
 * checklist só os itens novos — nunca apaga nem sobrescreve o trabalho da equipe.
 */
export async function syncChecklist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  editalId: string,
  workspaceId: string,
): Promise<{ added: number; notes: string[] }> {
  const { data: row } = await supabase
    .from("editais")
    .select("*")
    .eq("id", editalId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!row) return { added: 0, notes: ["Edital não encontrado."] };
  const edital = toEdital(row);

  const source = await loadEditalText(supabase, orgId, edital);
  const rules = extractWorkspaceRules(source.text, source.source);
  const seeds = buildChecklistSeeds(edital, rules);

  const { data: existing } = await supabase
    .from("edital_workspace_items")
    .select("source_key, position")
    .eq("workspace_id", workspaceId);
  const fresh = newSeeds(
    seeds,
    (existing ?? []).map((item) => item.source_key),
  );
  const start = Math.max(0, ...(existing ?? []).map((item) => item.position)) + 1;

  const { error: rulesError } = await supabase
    .from("edital_workspaces")
    .update({
      rules: rules as unknown as Json,
      rules_source: source.source === "fields" ? "fields" : "pdf",
      rules_extracted_at: new Date().toISOString(),
    })
    .eq("id", workspaceId)
    .eq("org_id", orgId);
  if (rulesError) throw new Error(rulesError.message);

  if (fresh.length > 0) {
    const { error } = await supabase.from("edital_workspace_items").insert(
      fresh.map((seed, index) => ({
        org_id: orgId,
        workspace_id: workspaceId,
        category: seed.category,
        title: seed.title,
        description: seed.description,
        requirement: seed.requirement,
        origin: "edital",
        source_key: seed.sourceKey,
        evidence: seed.evidence ? seed.evidence.slice(0, 1000) : null,
        char_limit: seed.charLimit,
        word_limit: seed.wordLimit,
        page_limit: seed.pageLimit,
        position: start + index,
      })),
    );
    if (error) throw new Error(error.message);
  }
  return { added: fresh.length, notes: source.notes };
}
