# Arquitetura — visão geral

```
apps/web (Next.js) ──► Supabase (Postgres + Auth + Storage)
   │  proxy.ts: renova sessão, bloqueia não autenticados
   │  requireMembership(): valida usuário e papel por página
   ▼
packages/core  → papéis e permissões (regras puras, testadas)
packages/db    → tipos do banco (gerados)
packages/ai    → contrato de IA independente de fornecedor + registro de custos
supabase/      → migrações, seed, testes de RLS, templates de e-mail
```

## Estrutura de pastas

```
apps/
  web/
    src/
      app/                      rotas (App Router)
        (app)/                  área autenticada (layout exige login + organização)
          page.tsx              início
          conta/senha/          definir/trocar senha
          configuracoes/membros lista de membros (somente admin)
        login/                  tela de login
        auth/confirm/           destino dos links de convite/recuperação
        api/health/             verificação de saúde
        sem-acesso/             usuário sem organização ou sem permissão
      components/               componentes de interface compartilhados
      lib/
        auth/                   sessão, ações (login/logout/senha), validações
        supabase/               clientes Supabase (servidor e proxy)
        env.ts                  variáveis de ambiente validadas
      proxy.ts                  (antigo middleware) proteção de rotas
    scripts/invite-member.ts    convite/papel de membros (usa chave secreta)
packages/
  core/  db/  ai/
supabase/
  config.toml                   configuração do Supabase local
  migrations/                   uma migração por mudança (nunca editar uma já aplicada)
  seed.sql                      dados de desenvolvimento (sem dados sigilosos)
  templates/                    e-mails de convite e recuperação (pt-BR)
  tests/                        testes de permissão em SQL
docs/
  adr/                          decisões de arquitetura
scripts/db-test.sh              executa os testes de banco
```

## Como adicionar um novo módulo (checklist)

1. **Banco**: nova migração criando o schema do módulo (ex.: `funding`), com:
   - `org_id uuid not null references core.organizations(id)` em toda tabela de negócio;
   - `enable row level security` + políticas usando `core.has_role(org_id, ...)`;
   - `grant` explícitos para `authenticated` (somente as operações/colunas necessárias) e `service_role`;
   - triggers `core.set_updated_at()` e, se fizer sentido, `core.audit_row_change()`.
2. Expor o schema em `supabase/config.toml` (`[api].schemas`) e no painel do Supabase em produção.
3. Testes de RLS em `supabase/tests/NNN_<modulo>_rls.sql`.
4. `pnpm db:types` para regenerar tipos (incluir o novo schema no comando).
5. Código de domínio em `packages/modules/<modulo>` (regras puras + casos de uso), sem importar tabelas de outros módulos.
6. Rotas em `apps/web/src/app/(app)/<rota-em-portugues>/` e item de navegação em `(app)/layout.tsx`.
7. Novas permissões em `packages/core/src/auth/permissions.ts`.
8. ADR se houver decisão técnica nova.

## Segurança — regras de ouro

- A **chave secreta** do Supabase (`SUPABASE_SECRET_KEY`) nunca vai para o navegador nem para variáveis `NEXT_PUBLIC_*`.
- Toda consulta do app usa a sessão do usuário → RLS sempre aplicado.
- Arquivos `.env*` (exceto `.env.example`) nunca são versionados.
- Conteúdo externo (editais, PDFs) será tratado como **dado**, nunca como instrução para a IA.
