import "server-only";

import { createHash } from "node:crypto";
import {
  MATCH_VERSION,
  matchInputs,
  matchProjects,
  toEdital,
  type MatchProject,
  type MatchResult,
  type Proponent,
} from "@lep/funding";
import { loadProponent } from "@/lib/proponent";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

export function inputsHash(
  edital: Parameters<typeof matchInputs>[0],
  project: MatchProject,
  proponent: Proponent,
): string {
  return createHash("sha256")
    .update(matchInputs(edital, project, proponent))
    .digest("hex");
}

/** Linha de core.edital_matches para um resultado. */
export function matchRow(
  orgId: string,
  editalId: string,
  result: MatchResult,
  hash: string,
  now: Date,
) {
  return {
    org_id: orgId,
    edital_id: editalId,
    projeto_id: result.projectId,
    version: MATCH_VERSION,
    score: result.score,
    confidence: result.confidence,
    level: result.level,
    verdict: result.verdict,
    factors: result.factors,
    blockers: result.blockers,
    inputs_hash: hash,
    computed_at: now.toISOString(),
  };
}

/**
 * Grava o Match v2 (último cálculo por edital × projeto). Chamado quando o
 * edital, os projetos ou a varredura mudam. Falhas só vão para o log: a tela
 * sempre calcula ao vivo e nunca depende do que está gravado.
 */
export async function persistMatches(
  client: Client,
  orgId: string,
  editalIds: string[] | "all",
  now: Date = new Date(),
): Promise<number> {
  if (editalIds !== "all" && editalIds.length === 0) return 0;
  let editalQuery = client.from("editais").select("*").eq("org_id", orgId);
  if (editalIds !== "all") editalQuery = editalQuery.in("id", editalIds);
  const [editais, projects, proponent] = await Promise.all([
    editalQuery,
    client.from("projetos").select("id, title, format, genre, stage, budget").eq("org_id", orgId),
    loadProponent(client, orgId),
  ]);
  if (editais.error || projects.error) {
    console.error("Match v2 não gravado (leitura):", editais.error?.code ?? projects.error?.code);
    return 0;
  }
  const rows = (editais.data ?? []).flatMap((row) => {
    const edital = toEdital(row);
    return matchProjects(edital, projects.data ?? [], now, proponent).map((result) =>
      matchRow(
        orgId,
        edital.id,
        result,
        inputsHash(
          edital,
          projects.data!.find((project) => project.id === result.projectId)!,
          proponent,
        ),
        now,
      ),
    );
  });
  if (rows.length === 0) return 0;
  const { error } = await client
    .from("edital_matches")
    .upsert(rows, { onConflict: "edital_id,projeto_id" });
  if (error) {
    console.error("Match v2 não gravado:", error.code);
    return 0;
  }
  return rows.length;
}
