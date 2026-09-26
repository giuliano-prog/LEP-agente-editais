import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@lep/db";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente com a chave SECRETA (ignora RLS). Uso restrito a processos do servidor
 * sem usuário logado — hoje, somente a varredura automática de editais (ADR-0012).
 * Nunca importar em componentes de cliente nem expor resultados sem filtrar por org.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey)
    throw new Error(
      "SUPABASE_SECRET_KEY não configurada (necessária para a varredura automática).",
    );
  return createClient<Database, "core">(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    db: { schema: "core" },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isAdminClientConfigured() {
  return Boolean(process.env.SUPABASE_SECRET_KEY);
}
