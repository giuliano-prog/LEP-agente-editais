import type { Metadata } from "next";
import { ROLE_LABELS } from "@lep/core";
import { Card, PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { runDiagnostics, type Check } from "@/lib/diagnostics";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Diagnóstico" };

const ICON: Record<Check["status"], { symbol: string; tone: string }> = {
  ok: { symbol: "✓", tone: "text-ok" },
  warn: { symbol: "⚠", tone: "text-warn" },
  fail: { symbol: "✕", tone: "text-bad" },
};

export default async function DiagnosticsPage() {
  const { email, membership } = await requireMembership("admin");
  const supabase = await createClient();
  const checks = await runDiagnostics(supabase, membership.orgId);
  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnóstico"
        description="Verifica a configuração do Supabase e da Vercel usada pela plataforma. Nenhum dado é alterado."
      />

      <Card>
        <p className="text-sm">
          Sessão: <span className="font-medium">{email}</span> · {membership.orgName} ·{" "}
          {ROLE_LABELS[membership.role]}
        </p>
        <p
          className={`mt-2 text-sm font-medium ${failures ? "text-bad" : warnings ? "text-warn" : "text-ok"}`}
        >
          {failures
            ? `${failures} problema(s) impedem o funcionamento completo.`
            : warnings
              ? `Tudo funcionando; ${warnings} item(ns) opcional(is) desligado(s).`
              : "Tudo certo."}
        </p>
      </Card>

      <ul className="space-y-3">
        {checks.map((check) => (
          <li key={check.label} className="rounded-xl border border-line bg-card p-4">
            <p className="font-medium">
              <span className={ICON[check.status].tone}>{ICON[check.status].symbol}</span>{" "}
              {check.label}
            </p>
            <p className="mt-1 text-sm text-muted">{check.detail}</p>
            {check.fix && check.status !== "ok" && (
              <p className="mt-2 text-sm">
                <span className="font-medium text-brand">Como corrigir: </span>
                {check.fix}
              </p>
            )}
          </li>
        ))}
      </ul>

      <Card>
        <p className="text-sm text-muted">
          Para conferir o que só o banco consegue ver (migrações aplicadas, políticas antigas,
          editais sem organização, vínculos dos usuários), execute o script somente leitura{" "}
          <code className="text-fg">supabase/scripts/diagnostico.sql</code> no SQL Editor do
          Supabase.
        </p>
      </Card>
    </div>
  );
}
