import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { TEAM_ROLES } from "@/lib/team/model";

export const metadata: Metadata = { title: "Cadastrar Profissional" };

const control =
  "w-full rounded-md border border-line bg-card-raised px-3 py-2 text-sm text-fg outline-none placeholder:text-muted/70 focus:border-brand focus:ring-1 focus:ring-brand";

/**
 * Cadastro de profissional (V1). O banco de profissionais ainda não existe: o formulário
 * mostra os campos da ficha, mas NÃO grava (botão desabilitado, sem Server Action).
 * Quando a tabela existir, ligar a uma action com `requireMembership("editor")`.
 */
export default async function NewProfessionalPage() {
  await requireMembership("editor");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/equipe-audiovisual" className="inline-block text-sm text-muted hover:text-brand">
        ← Equipe Audiovisual
      </Link>
      <PageHeader
        title="Cadastrar Profissional"
        description="Profissionais não precisam ter acesso à plataforma. Um profissional pode ter várias funções."
      />
      <Card>
        <form className="space-y-4" aria-describedby="aviso-cadastro">
          <Text label="Nome" name="name" />
          <label className="block space-y-1">
            <span className="text-sm font-medium">Função principal</span>
            <select name="main_role" className={control} defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {TEAM_ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
          <Text label="Outras funções" name="other_roles" hint="Separe por vírgula." />
          <Text label="Localização (cidade/UF)" name="location" />
          <Text label="Contato" name="contact" />
          <Text label="Portfólio (link)" name="portfolio" type="url" />
          <Text label="Disponibilidade" name="availability" />
          <Text label="Cachê de referência" name="fee" />
          <label className="block space-y-1">
            <span className="text-sm font-medium">Experiência</span>
            <textarea name="experience" className={`${control} min-h-24`} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Observações internas</span>
            <textarea name="notes" className={`${control} min-h-20`} />
          </label>
          <p id="aviso-cadastro" className="text-xs text-muted">
            Nesta versão o cadastro de profissionais ainda não grava dados.
          </p>
          <button
            type="button"
            disabled
            className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-surface opacity-50"
          >
            Salvar profissional
          </button>
        </form>
      </Card>
    </div>
  );
}

function Text({
  label,
  name,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input type={type} name={name} className={control} />
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
