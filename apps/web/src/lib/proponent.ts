import "server-only";

import { LEP_HEADQUARTERS, type Proponent } from "@lep/funding";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

/**
 * Sede do proponente da organização (diretriz nº 2: o proponente é sempre a própria
 * LEP; parceiras não contam). Sem sede cadastrada — ou antes da migração de
 * diretrizes — usa a sede da LEP Filmes (São Paulo/SP).
 */
export async function loadProponent(client: Client, orgId: string): Promise<Proponent> {
  const { data, error } = await client
    .from("organizations")
    .select("hq_state, hq_city")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !data?.hq_state) return LEP_HEADQUARTERS;
  return { state: data.hq_state, city: data.hq_city };
}

/**
 * Territórios com parceria configurada (espaço para o futuro; hoje sempre vazio).
 * Não tornam a LEP elegível: só classificam editais restritos como "via parceiro".
 */
export async function loadPartnerTerritories(client: Client, orgId: string): Promise<string[]> {
  const { data, error } = await client
    .from("organizations")
    .select("partner_territories")
    .eq("id", orgId)
    .maybeSingle();
  if (error || !Array.isArray(data?.partner_territories)) return [];
  return data.partner_territories.filter((item): item is string => typeof item === "string");
}
