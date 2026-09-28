/**
 * Identifica o TIPO da chave configurada em SUPABASE_SECRET_KEY sem usá-la na rede
 * e sem expor o valor. Aceita as chaves novas (sb_secret_/sb_publishable_) e as
 * legadas em JWT (claim "role": service_role | anon).
 */
export type ServiceKeyKind =
  "missing" | "secret" | "publishable" | "service_role_jwt" | "anon_jwt" | "other_jwt" | "unknown";

export const SERVICE_KEY_LABELS: Record<ServiceKeyKind, string> = {
  missing: "não configurada",
  secret: "Secret key (formato novo)",
  publishable: "Publishable key — incorreta para o servidor",
  service_role_jwt: "service_role (formato legado)",
  anon_jwt: "anon (formato legado) — incorreta para o servidor",
  other_jwt: "token sem papel de serviço — incorreta",
  unknown: "formato não reconhecido",
};

export function inspectServiceKey(key: string | undefined | null): ServiceKeyKind {
  const value = key?.trim();
  if (!value) return "missing";
  if (value.startsWith("sb_secret_")) return "secret";
  if (value.startsWith("sb_publishable_")) return "publishable";
  const parts = value.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
        role?: unknown;
      };
      if (payload.role === "service_role") return "service_role_jwt";
      if (payload.role === "anon") return "anon_jwt";
      return "other_jwt";
    } catch {
      return "unknown";
    }
  }
  return "unknown";
}
