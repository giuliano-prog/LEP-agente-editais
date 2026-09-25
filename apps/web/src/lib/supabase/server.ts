import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { Database } from "@lep/db";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a sessão do usuário (cookies), portanto todas as consultas passam pelo RLS.
 * Crie um cliente novo a cada requisição.
 */
export async function createClient() {
  // Ler cookies primeiro marca a rota como dinâmica (dados por usuário, nunca pré-renderizada).
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database, "core">(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      db: { schema: "core" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Chamado a partir de um Server Component (somente leitura).
            // Seguro ignorar: o proxy.ts renova a sessão a cada requisição.
          }
        },
      },
    },
  );
}
