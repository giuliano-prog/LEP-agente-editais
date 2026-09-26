import "server-only";

import { DOCUMENTS_BUCKET } from "@/lib/editais/constants";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { describeDbError } from "@/lib/supabase/errors";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Check = { label: string; status: "ok" | "warn" | "fail"; detail: string; fix?: string };

/** Colunas que o app usa em cada tabela (por etapa/migração). */
const REQUIRED: {
  table:
    | "organizations"
    | "memberships"
    | "editais"
    | "projetos"
    | "edital_documents"
    | "edital_sources"
    | "monitor_runs";
  columns: string;
  migration: string;
}[] = [
  { table: "organizations", columns: "id, name, slug", migration: "20260925120000 (Etapa 0)" },
  {
    table: "memberships",
    columns: "id, org_id, user_id, role",
    migration: "20260925120000 (Etapa 0)",
  },
  {
    table: "editais",
    columns:
      "id, org_id, title, agency, status, deadline, total_amount, max_amount_per_project, summary, eligibility_criteria, categories, required_documents, official_url, official_links, accepted_formats, accepted_genres, accepted_stages, min_budget, max_budget, review_status",
    migration: "20260926120000 (Etapa 1)",
  },
  {
    table: "projetos",
    columns: "id, org_id, title, format, genre, synopsis, budget, stage",
    migration: "20260926120000 (Etapa 1)",
  },
  {
    table: "edital_documents",
    columns: "id, org_id, edital_id, kind, sha256, storage_path",
    migration: "20260927120000 (Etapa 2)",
  },
  {
    table: "edital_sources",
    columns: "id, org_id, name, list_url, active, last_status",
    migration: "20260928120000 (Etapa 4)",
  },
  {
    table: "monitor_runs",
    columns: "id, org_id, status, imported",
    migration: "20260928120000 (Etapa 4)",
  },
];

export async function runDiagnostics(supabase: Supabase, orgId: string): Promise<Check[]> {
  const checks: Check[] = [];

  // 1. Schema exposto (a primeira consulta revela se o PostgREST aceita "core").
  const probe = await supabase.from("organizations").select("id").eq("id", orgId).maybeSingle();
  const probeProblem = describeDbError(probe.error);
  if (probeProblem?.kind === "schema_not_exposed") {
    return [
      {
        label: "Schema “core” liberado na API",
        status: "fail",
        detail: probeProblem.title,
        fix: probeProblem.fix,
      },
    ];
  }
  checks.push({
    label: "Schema “core” liberado na API",
    status: "ok",
    detail: "A API do Supabase aceita consultas ao schema core.",
  });

  // 2. Tabelas e colunas usadas pelo app.
  for (const item of REQUIRED) {
    const { error } = await supabase.from(item.table).select(item.columns).limit(1);
    const problem = describeDbError(error);
    checks.push(
      problem
        ? {
            label: `Tabela core.${item.table}`,
            status: "fail",
            detail: `${problem.title} (${error?.message ?? ""})`,
            fix: `${problem.fix} Migração: ${item.migration}.`,
          }
        : {
            label: `Tabela core.${item.table}`,
            status: "ok",
            detail: "Tabela e colunas acessíveis.",
          },
    );
  }

  // 3. Colunas da varredura em editais (Etapa 4).
  const monitorColumns = await supabase
    .from("editais")
    .select("origin, source_id, discovered_at")
    .limit(1);
  checks.push(
    monitorColumns.error
      ? {
          label: "Colunas de monitoramento em core.editais",
          status: "fail",
          detail: monitorColumns.error.message,
          fix: "Aplique a migração 20260928120000 (GitHub → Actions → “Migrações Supabase (produção)” → Run workflow).",
        }
      : {
          label: "Colunas de monitoramento em core.editais",
          status: "ok",
          detail: "origin, source_id e discovered_at presentes.",
        },
  );

  // 3b. Diretrizes LEP (sede do proponente e território dos editais).
  const [hq, territories] = await Promise.all([
    supabase.from("organizations").select("hq_state, hq_city").eq("id", orgId).maybeSingle(),
    supabase.from("editais").select("eligible_territories, triage_reason").limit(1),
  ]);
  const guidelineError = hq.error ?? territories.error;
  checks.push(
    guidelineError
      ? {
          label: "Diretrizes LEP (território e sede)",
          status: "fail",
          detail: guidelineError.message,
          fix: "Aplique a migração 20260929120000 (GitHub → Actions → “Migrações Supabase (produção)” → Run workflow).",
        }
      : hq.data?.hq_state
        ? {
            label: "Diretrizes LEP (território e sede)",
            status: "ok",
            detail: `Proponente sediado em ${hq.data.hq_city ?? "?"}/${hq.data.hq_state}. Editais exclusivos de outros territórios são descartados.`,
          }
        : {
            label: "Diretrizes LEP (território e sede)",
            status: "warn",
            detail:
              "Sede do proponente não cadastrada: a análise usa São Paulo/SP (padrão da LEP Filmes).",
            fix: "Defina a sede em Membros → Proponente.",
          },
  );

  // 4. Armazenamento de documentos.
  const storage = await supabase.storage.from(DOCUMENTS_BUCKET).list(orgId, { limit: 1 });
  checks.push(
    storage.error
      ? {
          label: `Armazenamento (bucket “${DOCUMENTS_BUCKET}”)`,
          status: "fail",
          detail: storage.error.message,
          fix: "Aplique a migração 20260927120000 (cria o bucket e as permissões) pelo workflow “Migrações Supabase (produção)”.",
        }
      : {
          label: `Armazenamento (bucket “${DOCUMENTS_BUCKET}”)`,
          status: "ok",
          detail: "Bucket acessível para a organização.",
        },
  );

  // 5. Configuração da varredura automática (nunca exibe valores).
  if (!isAdminClientConfigured()) {
    checks.push({
      label: "Chave de serviço (SUPABASE_SECRET_KEY)",
      status: "warn",
      detail: "Não configurada: a varredura automática e o botão “Verificar agora” não funcionam.",
      fix: "Vercel → Settings → Environment Variables → SUPABASE_SECRET_KEY (Supabase → Project Settings → API Keys → Secret key). Refaça o deploy.",
    });
  } else {
    const { error } = await createAdminClient()
      .from("edital_sources")
      .select("id", { head: true, count: "exact" });
    checks.push(
      error
        ? {
            label: "Chave de serviço (SUPABASE_SECRET_KEY)",
            status: "fail",
            detail: `Configurada, mas o acesso falhou: ${error.message}`,
            fix: "Confira se a chave é a Secret key do mesmo projeto Supabase.",
          }
        : {
            label: "Chave de serviço (SUPABASE_SECRET_KEY)",
            status: "ok",
            detail: "Configurada e válida.",
          },
    );
  }
  const cronSecret = process.env.CRON_SECRET ?? "";
  checks.push(
    cronSecret.length >= 16
      ? {
          label: "Agendamento diário (CRON_SECRET)",
          status: "ok",
          detail: "Configurado. A Vercel chama /api/cron/monitor diariamente (vercel.json).",
        }
      : {
          label: "Agendamento diário (CRON_SECRET)",
          status: "warn",
          detail:
            "Não configurado (ou curto demais): a varredura diária automática fica desligada.",
          fix: "Vercel → Environment Variables → CRON_SECRET com 16+ caracteres aleatórios (ex.: openssl rand -hex 32). Refaça o deploy.",
        },
  );

  return checks;
}
