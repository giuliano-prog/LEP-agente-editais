import { timingSafeEqual } from "node:crypto";
import { isAdminClientConfigured, createAdminClient } from "@/lib/supabase/admin";
import { runMonitor } from "@/lib/monitor/run";

// Tempo máximo da função na Vercel (segundos).
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Varredura diária (Vercel Cron — ver vercel.json). A Vercel envia
 * "Authorization: Bearer <CRON_SECRET>". Sem o segredo correto, nada é executado.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "não autorizado" }, { status: 401 });
  if (!isAdminClientConfigured()) {
    return Response.json({ error: "SUPABASE_SECRET_KEY não configurada" }, { status: 503 });
  }

  try {
    const results = await runMonitor(createAdminClient(), { trigger: "cron" });
    return Response.json({
      sources: results.length,
      imported: results.reduce((total, result) => total + result.imported, 0),
      errors: results.filter((result) => result.status !== "ok").length,
    });
  } catch (error) {
    console.error("Varredura (cron) falhou:", error instanceof Error ? error.message : error);
    return Response.json({ error: "falha na varredura" }, { status: 500 });
  }
}
