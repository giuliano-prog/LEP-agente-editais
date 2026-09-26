import Link from "next/link";
import { describeDbError } from "@/lib/supabase/errors";

/**
 * Aviso de erro do banco com causa e correção. Administradores veem o link para
 * o Diagnóstico; demais usuários são orientados a falar com um administrador.
 */
export function DbErrorNotice({
  error,
  isAdmin,
  context,
}: {
  error: { code?: string | null; message?: string | null } | null | undefined;
  isAdmin: boolean;
  context: string;
}) {
  const problem = describeDbError(error);
  if (!problem) return null;
  return (
    <div
      role="alert"
      className="space-y-1 rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-sm"
    >
      <p className="font-medium text-bad">
        Não foi possível carregar {context}. {problem.title}
      </p>
      {isAdmin ? (
        <p className="text-muted">
          Como corrigir: {problem.fix}{" "}
          <Link href="/configuracoes/diagnostico" className="text-brand hover:underline">
            Abrir diagnóstico →
          </Link>
        </p>
      ) : (
        <p className="text-muted">Avise um administrador da plataforma.</p>
      )}
    </div>
  );
}
