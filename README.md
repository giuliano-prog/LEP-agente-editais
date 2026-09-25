# Plataforma LEP

Plataforma de inteligência e automação da **LEP Filmes** para o setor audiovisual.
Arquitetura modular: o primeiro módulo será **Captação de Recursos / Editais**.

> **Status: Etapa 0 — Fundação.** Monorepo, app Next.js, banco Supabase, autenticação,
> permissões e documentação. Nenhum módulo de negócio implementado ainda.

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

## Estrutura

```
apps/web/          Next.js (interface, autenticação)
packages/core/     papéis e permissões
packages/db/       tipos do banco
packages/ai/       contrato de IA independente de fornecedor + registro de custos
supabase/          migrações, seed, testes SQL, templates de e-mail
docs/              arquitetura e ADRs
```

## Segurança

- Dados da LEP são **sigilosos**. Nunca versione `.env.local`, chaves ou dados reais.
- A chave secreta (`SUPABASE_SECRET_KEY`) ignora as regras de acesso: use apenas em scripts administrativos.
- Todas as tabelas têm RLS; o cadastro público está desligado (acesso só por convite).
