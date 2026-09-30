import "server-only";

import {
  editalStatusLabel,
  matchProjects,
  summarizeAdherence,
  toEdital,
  type Adherence,
  type Edital,
} from "@lep/funding";
import { loadProponent } from "@/lib/proponent";
import type { createClient } from "@/lib/supabase/server";
import { safeExternalUrl } from "./links";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Edital encontrado numa busca (dados simples, prontos para a tela). */
export type FoundEdital = {
  id: string;
  title: string;
  agency: string | null;
  deadline: string | null;
  status: string | null;
  statusLabel: string;
  eligibilityStatus: Edital["eligibilityStatus"];
  officialUrl: string | null;
  origin: string;
  /** true = entrou nesta execução; false = já estava cadastrado e foi visto de novo. */
  isNew: boolean;
  adherence: Adherence | null;
};

const LIMIT = 40;

/**
 * Editais encontrados por uma execução iniciada em `since`: os importados agora
 * (`discovered_at`) e os já cadastrados vistos de novo (`edital_sightings.last_seen_at`).
 * Usa a sessão do usuário (RLS). Falhas de leitura resultam em lista vazia — a busca
 * em si já terminou e o resumo técnico continua disponível.
 */
export async function loadFoundEditais(
  supabase: Supabase,
  orgId: string,
  since: string,
): Promise<FoundEdital[]> {
  const [fresh, sightings, projects, proponent] = await Promise.all([
    supabase
      .from("editais")
      .select("*")
      .eq("org_id", orgId)
      .gte("discovered_at", since)
      .limit(LIMIT),
    supabase
      .from("edital_sightings")
      .select("edital_id")
      .eq("org_id", orgId)
      .gte("last_seen_at", since)
      .limit(LIMIT),
    supabase.from("projetos").select("id, title, format, genre, stage, budget").eq("org_id", orgId),
    loadProponent(supabase, orgId),
  ]);
  const newRows = fresh.error ? [] : (fresh.data ?? []);
  const newIds = new Set(newRows.map((row) => String(row.id)));
  const seenIds = [
    ...new Set(
      (sightings.error ? [] : (sightings.data ?? []))
        .map((row) => String(row.edital_id))
        .filter((id) => !newIds.has(id)),
    ),
  ];
  const seenRows =
    seenIds.length > 0
      ? ((await supabase.from("editais").select("*").eq("org_id", orgId).in("id", seenIds)).data ??
        [])
      : [];

  const now = new Date();
  const projectList = projects.error ? null : (projects.data ?? []);
  const toFound = (row: Record<string, unknown>, isNew: boolean): FoundEdital => {
    const edital = toEdital(row);
    return {
      id: edital.id,
      title: edital.title,
      agency: edital.agency,
      deadline: edital.deadline,
      status: edital.status,
      statusLabel: editalStatusLabel(edital.status),
      eligibilityStatus: edital.eligibilityStatus,
      officialUrl: safeExternalUrl(edital.officialUrl),
      origin: edital.origin,
      isNew,
      adherence: projectList
        ? summarizeAdherence(matchProjects(edital, projectList, now, proponent))
        : null,
    };
  };
  return [
    ...newRows.map((row) => toFound(row, true)),
    ...seenRows.map((row) => toFound(row, false)),
  ].slice(0, LIMIT);
}
