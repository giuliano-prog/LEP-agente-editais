/**
 * Convida (ou atualiza) um membro da organização.
 *
 * Uso:
 *   pnpm members:invite --email pessoa@lepfilmes.com --role admin [--name "Nome"]
 *                       [--org-slug lep-filmes] [--org-name "LEP Filmes"] [--yes]
 *
 * - Cria a organização se ainda não existir.
 * - Envia convite por e-mail se o usuário não existir (localmente o e-mail
 *   aparece no Mailpit: http://127.0.0.1:54324).
 * - Define o papel do usuário na organização (admin | editor | viewer).
 *
 * Usa a chave SECRETA (ignora RLS). Contra um Supabase remoto, exige --yes.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { isRole, ROLES } from "@lep/core";
import type { Database } from "@lep/db";

function fail(message: string): never {
  console.error(`✕ ${message}`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    email: { type: "string" },
    role: { type: "string" },
    name: { type: "string" },
    "org-slug": { type: "string", default: "lep-filmes" },
    "org-name": { type: "string", default: "LEP Filmes" },
    yes: { type: "boolean", default: false },
  },
});

const email = args.email?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Informe --email válido.");
if (!isRole(args.role)) fail(`Informe --role com um destes valores: ${ROLES.join(", ")}.`);
const role = args.role;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
if (!url || !secretKey)
  fail("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em apps/web/.env.local.");

const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url);
console.log(`Supabase: ${url} ${isLocal ? "(local)" : "(REMOTO)"}`);
console.log(`Ação: garantir organização "${args["org-slug"]}" e dar papel "${role}" a ${email}.`);
if (!isLocal && !args.yes) {
  fail("Alvo remoto: revise a ação acima e execute novamente com --yes para confirmar.");
}

const supabase = createClient<Database, "core">(url, secretKey, {
  db: { schema: "core" },
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureOrganization(): Promise<string> {
  const slug = args["org-slug"]!;
  const { data: existing, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(`Erro ao buscar organização: ${error.message}`);
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("organizations")
    .insert({ slug, name: args["org-name"]! })
    .select("id")
    .single();
  if (createError) fail(`Erro ao criar organização: ${createError.message}`);
  console.log(`✓ Organização criada: ${args["org-name"]}`);
  return created.id;
}

async function ensureUser(): Promise<string> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email!)
    .maybeSingle();
  if (error) fail(`Erro ao buscar usuário: ${error.message}`);
  if (profile) {
    console.log("✓ Usuário já existe (convite não reenviado).");
    return profile.id;
  }

  const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email!, {
    data: args.name ? { full_name: args.name } : undefined,
    redirectTo: `${siteUrl}/conta/senha`,
  });
  if (inviteError) fail(`Erro ao enviar convite: ${inviteError.message}`);
  console.log(
    `✓ Convite enviado para ${email}.${isLocal ? " Veja em http://127.0.0.1:54324" : ""}`,
  );
  return data.user.id;
}

const orgId = await ensureOrganization();
const userId = await ensureUser();

const { error: membershipError } = await supabase
  .from("memberships")
  .upsert({ org_id: orgId, user_id: userId, role }, { onConflict: "org_id,user_id" });
if (membershipError) fail(`Erro ao definir papel: ${membershipError.message}`);

console.log(`✓ ${email} agora é "${role}" na organização "${args["org-slug"]}".`);
