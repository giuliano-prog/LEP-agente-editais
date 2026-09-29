import { isAuthorizedCron } from "@/lib/cron-auth";
import { runWebDiscovery } from "@/lib/discovery/run";
import { isAdminClientConfigured, createAdminClient } from "@/lib/supabase/admin";

// Tempo máximo da função na Vercel (segundos).
export const maxDuration = 60;

/**
 * Descoberta web automática (ADR-0024) — mesma lógica do botão "Buscar novas
 * oportunidades". AINDA NÃO AGENDADA em vercel.json: agendar só depois de configurar
 * o provedor de busca (WEB_SEARCH_PROVIDER / WEB_SEARCH_API_KEY) e validar o custo.
 * Sem o CRON_SECRET correto, nada é executado.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }
  if (!isAdminClientConfigured()) {
    return Response.json({ error: "SUPABASE_SECRET_KEY não configurada" }, { status: 503 });
  }
  try {
    const results = await runWebDiscovery(createAdminClient(), { trigger: "cron" });
    // Só contagens: nenhum dado de edital sai na resposta.
    return Response.json({
      organizations: results.length,
      notConfigured: results.filter((result) => result.status === "not_configured").length,
      queries: results.reduce((sum, result) => sum + result.queriesRun, 0),
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      errors: results.filter((result) => result.status === "error").length,
    });
  } catch (error) {
    console.error("Descoberta web (cron) falhou:", error instanceof Error ? error.message : error);
    return Response.json({ error: "falha na descoberta" }, { status: 500 });
  }
}
