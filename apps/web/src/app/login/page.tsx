import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  "link-invalido": "O link é inválido ou expirou. Peça um novo convite ao administrador.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  if (await getSession()) redirect("/");
  const { erro } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">LEP Filmes</h1>
          <p className="text-sm text-zinc-500">Acesso restrito à equipe. Entre com seu e-mail.</p>
        </div>
        <LoginForm initialError={erro ? ERRORS[erro] : undefined} />
      </div>
    </main>
  );
}
