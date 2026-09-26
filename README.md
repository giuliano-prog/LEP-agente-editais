# Plataforma LEP

Plataforma de inteligência e automação da **LEP Filmes** para o setor audiovisual.
Arquitetura modular: o primeiro módulo será **Captação de Recursos / Editais**.

> **Status: Etapa 2.** Fundação (autenticação, permissões, RLS), identidade visual LEP,
> **Editais** (cadastro por link, PDF ou manual, com cópia original guardada e revisão humana),
> **Projetos LEP** e **Match explicável** edital × projeto.

## Tecnologias

| Camada    | Tecnologia                                                             |
| --------- | ---------------------------------------------------------------------- |
| Web       | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4 |
| Backend   | Supabase: PostgreSQL 17, Auth, RLS                                     |
| Validação | Zod                                                                    |
| Testes    | Vitest (unidade) + testes SQL de permissões (RLS)                      |
| Qualidade | ESLint, Prettier, GitHub Actions (CI)                                  |
| Monorepo  | pnpm workspaces                                                        |

Decisões e justificativas: [`docs/adr/`](docs/adr/README.md). Visão geral: [`docs/arquitetura.md`](docs/arquitetura.md).

## Pré-requisitos

- **Node.js 22** (`nvm use` lê o `.nvmrc`)
- **pnpm 10** (`corepack enable`)
- **Docker Desktop** em execução (o Supabase local roda em containers)

## Rodando localmente

```bash
# 1. Instalar dependências (inclui o Supabase CLI)
pnpm install

# 2. Subir o Supabase local (primeira vez baixa as imagens; demora alguns minutos)
pnpm db:start
#    → aplica as migrações e o seed (cria a organização "LEP Filmes")
#    → mostra URLs e chaves. Para ver de novo: pnpm db:status

# 3. Configurar variáveis de ambiente do app
cp apps/web/.env.example apps/web/.env.local
#    Preencha com os valores de `pnpm db:status`:
#    NEXT_PUBLIC_SUPABASE_URL             = "API URL"  (http://127.0.0.1:54321)
#    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "Publishable key" (ou "anon key")
#    SUPABASE_SECRET_KEY                  = "Secret key" (ou "service_role key")

# 4. Convidar o primeiro administrador
pnpm members:invite --email voce@lepfilmes.com --role admin --name "Seu Nome"
#    O e-mail de convite aparece no Mailpit: http://127.0.0.1:54324

# 5. Iniciar o app
pnpm dev
#    → http://localhost:3000
```

Abra o convite no Mailpit, clique em **Aceitar convite**, defina a senha e você entra na plataforma.

## Comandos

| Comando                     | O que faz                                                                 |
| --------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                  | App em modo desenvolvimento                                               |
| `pnpm build`                | Build de produção                                                         |
| `pnpm check`                | Formatação + lint + tipos + testes (rode antes de cada commit)            |
| `pnpm test`                 | Testes de unidade                                                         |
| `pnpm db:start` / `db:stop` | Liga/desliga o Supabase local                                             |
| `pnpm db:reset`             | Recria o banco local do zero (migrações + seed). **Apaga dados locais.**  |
| `pnpm db:test`              | Testes de permissões (RLS) no Supabase local                              |
| `pnpm db:types`             | Regenera `packages/db/src/database.types.ts` a partir do banco local      |
| `pnpm members:invite`       | Convida membro / define papel (`--email`, `--role admin\|editor\|viewer`) |

Painel do banco local (Supabase Studio): http://127.0.0.1:54323

## Como verificar se a fundação está funcionando

1. `pnpm check` → tudo verde (formatação, lint, tipos, testes de unidade).
2. `pnpm db:test` → lista de `ok - ...` terminando em **"Todos os testes de RLS passaram."**
3. `curl http://localhost:3000/api/health` → `{"status":"ok","supabase":"ok",...}`
4. Acessar http://localhost:3000 sem login → redireciona para `/login`.
5. Entrar como admin → página inicial mostra organização, papel e permissões; menu **Membros** visível.
6. Convidar outra pessoa com `--role viewer`, entrar com ela → menu **Membros** some e
   `/configuracoes/membros` mostra "Permissão insuficiente".

## Identidade visual

A paleta da LEP Filmes está em `apps/web/src/app/globals.css` (bloco `@theme`) e é usada por tokens:
`bg-surface` (#121212), `bg-card` (#1E1E1E), `text-fg` (#EEEEEE), `text-muted` (#A0A0A0) e
`text-brand`/`bg-brand` (laranja #F5821F).

A logomarca é lida de **`apps/web/public/logo.jpg`**. Enquanto o arquivo não estiver no
repositório, o cabeçalho exibe o nome "LEP FILMES" em texto.

## Aplicando as migrações no Supabase remoto

As migrações ficam em `supabase/migrations/`. Para aplicá-las no projeto remoto:

```bash
pnpm exec supabase link --project-ref <ref-do-projeto>   # uma vez
pnpm exec supabase db push --dry-run                      # confira o que será aplicado
pnpm exec supabase db push
```

A migração `20260926120000_editais_projetos.sql` é **conciliadora** para `core.editais`
(tabela criada originalmente no painel): cria só o que falta e **não apaga nem altera** colunas
existentes. Depois de aplicar, revise as políticas de acesso da tabela — políticas antigas
criadas manualmente continuam valendo e podem liberar acesso além do desejado:

```sql
select policyname, cmd, roles, qual from pg_policies
where schemaname = 'core' and tablename in ('editais', 'projetos');
```

As políticas esperadas são `editais_*` / `projetos_*` (ver migração). Remova as demais após conferência.

## Estrutura

```
apps/web/          Next.js (interface, autenticação, Editais, Projetos, Match)
packages/core/     papéis e permissões
packages/modules/projects/  vocabulário (formato, gênero, estágio) e validação de projetos
packages/modules/funding/   modelo do edital, validação do formulário e motor de Match explicável
packages/ingestion/         download seguro de URLs (anti-SSRF), hash, leitura de HTML
packages/db/       tipos do banco
packages/ai/       contrato de IA independente de fornecedor + registro de custos
supabase/          migrações, seed, testes SQL, templates de e-mail
docs/              arquitetura e ADRs
```

## Cadastro de editais (link, PDF ou manual)

Em **Editais → Novo edital** (papel Editor/Revisor ou Administrador):

1. **Link** — a plataforma baixa a página oficial ou o PDF, guarda uma cópia, sugere o título e lista os PDFs
   encontrados na página (que podem ser adicionados como anexos com um clique).
2. **PDF** — o arquivo vai direto do navegador para o armazenamento privado e é validado pelo servidor.
3. **Manual** — só o título; documentos podem ser anexados depois.

Depois, o formulário de revisão abre para preencher prazo, valores, critérios e as regras usadas no Match.
O edital só fica **validado** quando alguém marca "Revisei estas informações com o documento oficial".
Documentos repetidos (mesmo arquivo ou mesmo link oficial) são recusados com link para o edital existente.
Detalhes e proteções de segurança: [ADR-0011](docs/adr/0011-cadastro-editais-url-pdf.md).

> **Deploy (Vercel):** defina `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` antes do build —
> o navegador usa essas variáveis para enviar PDFs.

## Match explicável

O Match (`packages/modules/funding/src/match.ts`) compara regras **registradas** do edital com os dados
do projeto, sem IA: prazo/status, formato, gênero, estágio e faixa de orçamento. Critérios em texto e
documentos exigidos viram **pontos de atenção** para verificação humana. O resultado nunca afirma
aprovação — apenas compatibilidade técnica com os critérios cadastrados.

## Segurança

- Dados da LEP são **sigilosos**. Nunca versione `.env.local`, chaves ou dados reais.
- A chave secreta (`SUPABASE_SECRET_KEY`) ignora as regras de acesso: use apenas em scripts administrativos.
- Todas as tabelas têm RLS; o cadastro público está desligado (acesso só por convite).
