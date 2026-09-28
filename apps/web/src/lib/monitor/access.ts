import "server-only";

import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { describeDbError } from "@/lib/supabase/errors";
import type { createClient } from "@/lib/supabase/server";
import { inspectServiceKey, type ServiceKeyKind } from "./service-key";

type UserClient = Awaited<ReturnType<typeof createClient>>;

export type MonitorAccess = {
  keyKind: ServiceKeyKind;
  /** Fontes ativas que a interface (sessão do usuário) enxerga na organização. */
  userActive: number | null;
  /** Fontes ativas que o motor (chave de serviço) enxerga na mesma organização. */
  engineActive: number | null;
  ok: boolean;
  /** Mensagem clara quando algo impede ou distorce a varredura. */
  problem: string | null;
};

const KEY_PROBLEMS: Partial<Record<ServiceKeyKind, string>> = {
  missing: "SUPABASE_SECRET_KEY não está configurada no servidor: a varredura não roda.",
  publishable:
    "SUPABASE_SECRET_KEY contém a chave pública (publishable), não a Secret key: o motor não enxerga as fontes.",
  anon_jwt:
    "SUPABASE_SECRET_KEY contém a chave anon (legada), não a service_role/Secret key: o motor não enxerga as fontes.",
  other_jwt:
    "SUPABASE_SECRET_KEY contém um token que não é de serviço: o motor não enxerga as fontes.",
};

/**
 * Confere se o motor da varredura enxerga as mesmas fontes ativas que a interface.
 * Evita o sintoma "fontes ativas na tela, mas nenhuma fonte ativa para verificar".
 * Nunca expõe o valor da chave (só o tipo).
 */
export async function checkMonitorAccess(
  userClient: UserClient,
  orgId: string,
): Promise<MonitorAccess> {
  const keyKind = inspectServiceKey(process.env.SUPABASE_SECRET_KEY);

  const user = await userClient
    .from("edital_sources")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("active", true);
  const userActive = user.error ? null : (user.count ?? 0);

  if (KEY_PROBLEMS[keyKind] || !isAdminClientConfigured()) {
    return {
      keyKind,
      userActive,
      engineActive: null,
      ok: false,
      problem: KEY_PROBLEMS[keyKind] ?? KEY_PROBLEMS.missing!,
    };
  }

  const engine = await createAdminClient()
    .from("edital_sources")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("active", true);
  if (engine.error) {
    const problem = describeDbError(engine.error);
    return {
      keyKind,
      userActive,
      engineActive: null,
      ok: false,
      problem: `O motor não conseguiu ler as fontes com a chave de serviço: ${problem?.title ?? engine.error.message} Confira se SUPABASE_SECRET_KEY é a Secret key do mesmo projeto de NEXT_PUBLIC_SUPABASE_URL.`,
    };
  }

  const engineActive = engine.count ?? 0;
  if (userActive !== null && engineActive !== userActive) {
    return {
      keyKind,
      userActive,
      engineActive,
      ok: false,
      problem: `Divergência: a interface mostra ${userActive} fonte(s) ativa(s), mas o motor enxerga ${engineActive}. Confira se SUPABASE_SECRET_KEY é a Secret key do mesmo projeto de NEXT_PUBLIC_SUPABASE_URL.`,
    };
  }
  return { keyKind, userActive, engineActive, ok: true, problem: null };
}
