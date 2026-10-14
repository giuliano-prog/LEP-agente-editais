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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(ellipse_at_top,rgb(245_130_31/0.10),transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent"
      />
      <div className="lep-rise-in relative w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <Logo size="lg" />
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">Plataforma LEP</h1>
            <p className="text-sm text-muted">Acesso restrito à equipe. Entre com seu e-mail.</p>
          </div>
        </div>
        <div className="card p-6 sm:p-7" style={{ boxShadow: "var(--shadow-pop)" }}>
          <LoginForm initialError={erro ? ERRORS[erro] : undefined} />
        </div>
      </div>
    </main>
  );
}
