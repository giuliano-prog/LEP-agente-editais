"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@lep/db";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente Supabase no navegador. Usado apenas para enviar PDFs direto ao Storage
 * (evita o limite de tamanho das funções do servidor). O acesso é protegido pelas
 * políticas do bucket: só editores gravam, e só na pasta da própria organização.
 */
export function createBrowserSupabase() {
  const env = getPublicEnv();
  return createBrowserClient<Database, "core">(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      db: { schema: "core" },
    },
  );
}
