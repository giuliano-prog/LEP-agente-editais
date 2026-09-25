import { getPublicEnv } from "@/lib/env";

/**
 * Verificação de saúde: app no ar + Supabase Auth acessível.
 * Não expõe dados nem segredos. Útil para monitoramento e para testar a instalação.
 */
export async function GET() {
  let supabase: "ok" | "indisponivel" | "nao_configurado" = "nao_configurado";
  let env: ReturnType<typeof getPublicEnv> | undefined;

  try {
    env = getPublicEnv();
  } catch {
    // variáveis ausentes: permanece "nao_configurado"
  }

  if (env) {
    try {
      const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      supabase = response.ok ? "ok" : "indisponivel";
    } catch {
      supabase = "indisponivel";
    }
  }

  const healthy = supabase === "ok";
  return Response.json(
    { status: healthy ? "ok" : "degradado", app: "ok", supabase, time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
