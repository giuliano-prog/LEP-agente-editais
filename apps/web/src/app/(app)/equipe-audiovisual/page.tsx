import type { Metadata } from "next";
import { Avatar } from "@/components/avatar";
import { BlueprintNotice } from "@/components/blueprint";
import { Badge, PageHeader } from "@/components/ui";
import { requireMembership } from "@/lib/auth/session";
import { AUDIOVISUAL_FUNCTIONS, TEAM_FUTURE_FLOW, TEAM_PROFILE_SECTIONS } from "@/lib/blueprints";

export const metadata: Metadata = { title: "Equipe Audiovisual" };

/**
 * Perfil de DEMONSTRAÇÃO da planta: só nome e função. Nenhum outro dado (telefone,
 * endereço, cidade, currículo, portfólio, experiência, cachê) é preenchido — os campos
 * aparecem vazios de propósito.
 */
const DEMO_PROFILE = { name: "Giuliano", role: "Assistente de Platô" } as const;

/** Planta da Equipe Audiovisual: banco de profissionais (não são usuários da plataforma). */
export default async function EquipeAudiovisualPage() {
  await requireMembership();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Equipe Audiovisual"
        description="Banco de profissionais que trabalham nas produções da LEP."
      />
      <BlueprintNotice>
        Planta do módulo. Os profissionais cadastrados aqui não são usuários da plataforma — quem
        acessa o sistema fica em Membros.
      </BlueprintNotice>

      <section aria-labelledby="ficha" className="space-y-3">
        <h2 id="ficha" className="text-lg font-semibold">
          Ficha do profissional
        </h2>
        <article className="rounded-xl border border-line bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={DEMO_PROFILE.name} size="lg" />
            <div className="min-w-0 space-y-1">
              <p className="text-lg font-semibold">{DEMO_PROFILE.name}</p>
              <p className="text-sm text-muted">{DEMO_PROFILE.role}</p>
            </div>
            <span className="sm:ml-auto">
              <Badge tone="brand">Perfil de demonstração</Badge>
            </span>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {TEAM_PROFILE_SECTIONS.map((section) => (
              <div key={section.title} className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {section.title}
                </h3>
                <dl className="space-y-2 text-sm">
                  {section.fields.map((field) => (
                    <div key={field} className="rounded-md border border-dashed border-line p-2">
                      <dt className="text-xs text-muted">{field}</dt>
                      <dd>{fieldValue(field)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Exemplo de estrutura: somente nome e função são exibidos. Os demais campos ficam vazios
            até o módulo ser construído e o próprio profissional autorizar o cadastro dos dados.
          </p>
        </article>
      </section>

      <section aria-labelledby="funcoes" className="space-y-3">
        <h2 id="funcoes" className="text-lg font-semibold">
          Funções previstas
        </h2>
        <ul className="flex flex-wrap gap-2">
          {AUDIOVISUAL_FUNCTIONS.map((fn) => (
            <li key={fn}>
              <Badge>{fn}</Badge>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="fluxo" className="space-y-3">
        <h2 id="fluxo" className="text-lg font-semibold">
          Fluxo futuro
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          {TEAM_FUTURE_FLOW.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Valor exibido na ficha de demonstração: só nome e função; o resto fica vazio. */
function fieldValue(field: string) {
  if (field === "Nome") return DEMO_PROFILE.name;
  if (field === "Função principal") return DEMO_PROFILE.role;
  if (field === "Foto") return <span className="text-muted">Avatar provisório</span>;
  return <span className="text-muted">—</span>;
}
