/**
 * Traduz erros do Supabase/PostgREST em causa provável + como corrigir.
 * Usado nas telas (aviso claro em vez de erro genérico) e no Diagnóstico.
 */
export type DbProblem = {
  kind:
    | "schema_not_exposed"
    | "missing_table"
    | "missing_column"
    | "permission"
    | "session"
    | "unreachable"
    | "unknown";
  title: string;
  fix: string;
};

type ErrorLike = { code?: string | null; message?: string | null } | null | undefined;

export function describeDbError(error: ErrorLike): DbProblem | null {
  if (!error) return null;
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (code === "PGRST106" || /invalid schema|schema must be one of/i.test(message)) {
    return {
      kind: "schema_not_exposed",
      title: "O schema “core” não está liberado na API do Supabase.",
      fix: "No painel do Supabase: Project Settings → Data API → Exposed schemas → adicione “core” e salve.",
    };
  }
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(message)
  ) {
    return {
      kind: "missing_table",
      title: "Uma tabela necessária não existe no banco.",
      fix: "Aplique as migrações: GitHub → Actions → “Migrações Supabase (produção)” → Run workflow (ver README).",
    };
  }
  if (
    code === "42703" ||
    code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(message)
  ) {
    return {
      kind: "missing_column",
      title: "Uma coluna necessária não existe no banco.",
      fix: "Aplique as migrações: GitHub → Actions → “Migrações Supabase (produção)” → Run workflow (as migrações só acrescentam o que falta).",
    };
  }
  if (code === "42501" || /permission denied/i.test(message)) {
    return {
      kind: "permission",
      title: "O banco recusou o acesso (permissão).",
      fix: "Aplique as migrações (GitHub → Actions → “Migrações Supabase (produção)”) e confira o papel do usuário em Membros.",
    };
  }
  if (code === "PGRST301" || code === "PGRST303" || /jwt/i.test(message)) {
    return {
      kind: "session",
      title: "Sessão expirada ou inválida.",
      fix: "Saia e entre novamente.",
    };
  }
  if (/fetch failed|network|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return {
      kind: "unreachable",
      title: "Não foi possível conectar ao Supabase.",
      fix: "Confira NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY na Vercel e refaça o deploy.",
    };
  }
  return {
    kind: "unknown",
    title: "Erro inesperado ao consultar o banco.",
    fix: `Código: ${code || "—"}. Veja o Diagnóstico.`,
  };
}
