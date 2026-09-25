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

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">
          {lackingPermission ? "Permissão insuficiente" : "Acesso ainda não liberado"}
        </h1>
        <p className="text-sm text-zinc-600">
          {lackingPermission
            ? "Seu papel não permite acessar esta página. Fale com um administrador."
            : `A conta ${session.email} ainda não está vinculada a uma organização. Peça acesso a um administrador.`}
        </p>
        <div className="flex justify-center gap-3 text-sm">
          {lackingPermission && (
            <Link href="/" className="rounded-md border border-zinc-300 px-4 py-2 hover:bg-zinc-50">
              Voltar ao início
            </Link>
          )}
          <form action={signOut}>
            <button className="rounded-md bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700">
              Sair
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
