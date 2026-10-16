import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sem acesso" };

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const session = await requireUser();
  const { motivo } = await searchParams;
  const lackingPermission = motivo === "permissao" && session.membership;
  const suspended = !session.membership && session.membershipStatus === "suspended";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div
        style={{ boxShadow: "var(--shadow-pop)" }}
        className="card w-full max-w-md space-y-4 p-8 text-center"
      >
        <h1 className="text-lg font-semibold">
          {lackingPermission
            ? "Permissão insuficiente"
            : suspended
              ? "Acesso suspenso"
              : "Acesso ainda não liberado"}
        </h1>
        <p className="text-sm text-muted">
          {lackingPermission
            ? "Seu papel não permite acessar esta página. Fale com um administrador."
            : suspended
              ? `O acesso da conta ${session.email} foi suspenso por um administrador. Fale com a administração da LEP para reativá-lo.`
              : `A conta ${session.email} ainda não está vinculada a uma organização. Peça acesso a um administrador.`}
        </p>
        <div className="flex justify-center gap-3 text-sm">
          {lackingPermission && (
            <Link href="/" className="btn btn-secondary">
              Voltar ao início
            </Link>
          )}
          <form action={signOut}>
            <button className="btn btn-primary">Sair</button>
          </form>
        </div>
      </div>
    </main>
  );
}
