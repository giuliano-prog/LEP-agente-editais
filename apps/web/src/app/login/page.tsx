import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
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
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgb(245_130_31/0.12),transparent_60%)] px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-line bg-card p-8 shadow-2xl shadow-black/40">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo size="lg" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Plataforma LEP</h1>
            <p className="text-sm text-muted">Acesso restrito à equipe. Entre com seu e-mail.</p>
          </div>
        </div>
        <LoginForm initialError={erro ? ERRORS[erro] : undefined} />
      </div>
    </main>
  );
}
