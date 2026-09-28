import "server-only";

import { assessEligibility, extractFields, suggestionColumns } from "@lep/funding";
import { loadPartnerTerritories, loadProponent } from "@/lib/proponent";
import type { createClient } from "@/lib/supabase/server";
import type { IngestedDocument } from "./ingest";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function todayInBrasilia(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

/**
 * Cadastro manual por link/PDF (etapa 7): sugere prazo, valores, formatos… com
 * evidência e avalia a elegibilidade — tudo pendente de revisão no formulário.
 * Falhas (ex.: migração ainda não aplicada) não impedem o cadastro.
 */
export async function applyAutomaticSuggestions(
  supabase: Supabase,
  orgId: string,
  editalId: string,
  document: IngestedDocument,
  now: Date = new Date(),
): Promise<void> {
  const text = document.text ?? "";
  const isPdf = document.mimeType === "application/pdf";
  const fields = extractFields([
    { kind: isPdf ? "pdf" : "page", text, label: isPdf ? "Documento (PDF)" : "Página do edital" },
  ]);
  const [proponent, partnerTerritories] = await Promise.all([
    loadProponent(supabase, orgId),
    loadPartnerTerritories(supabase, orgId),
  ]);
  const eligibility = assessEligibility(`${document.suggestedTitle}\n${text}`, {
    proponent,
    partnerTerritories,
  });
  const { error } = await supabase
    .from("editais")
    .update({
      ...suggestionColumns(fields, { today: todayInBrasilia(now), pdf: document.pdf }),
      extracted_at: now.toISOString(),
      eligible_territories: eligibility.territories,
      eligibility_status: eligibility.status,
      eligibility_reason: eligibility.reason,
      eligibility_evidence: eligibility.evidence,
      eligibility_source: "auto",
      eligibility_checked_at: now.toISOString(),
    })
    .eq("id", editalId)
    .eq("org_id", orgId);
  if (error) console.error("Sugestões automáticas não gravadas:", error.code);
}
