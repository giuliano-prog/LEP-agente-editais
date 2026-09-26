import type { Metadata } from "next";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Definir senha" };

export default function PasswordPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Definir senha</h1>
        <p className="text-sm text-muted">
          Use esta página após aceitar um convite ou para trocar sua senha.
        </p>
      </div>
      <PasswordForm />
    </div>
  );
}
