# Plataforma LEP — guia para agentes

Monorepo pnpm (Node 22). Leia `docs/arquitetura.md` e `docs/adr/` antes de mudanças estruturais.

## Comandos

- `pnpm check` — formatação + lint + tipos + testes (rode antes de commitar)
- `pnpm build` — build de produção
- `DB_TEST_SHIM=1 DB_URL=... pnpm db:test` — testes de RLS em Postgres puro; `pnpm db:test` usa o Supabase local

## Convenções

- Interface em pt-BR; código, tabelas e colunas em inglês; comentários/docs em pt-BR.
- Toda tabela de negócio: `org_id`, RLS com `core.has_role`, grants explícitos, teste em `supabase/tests/`.
- Nunca editar migração já aplicada: crie uma nova.
- Papéis: `viewer < editor < admin` — manter `core.app_role` e `packages/core/src/auth/roles.ts` iguais.
- Não importar SDKs de IA fora de `packages/ai` (ADR-0006).
- Next.js 16: `src/proxy.ts` (não `middleware.ts`); `cookies()`/`searchParams` são assíncronos.
- Dados da LEP são sigilosos: nada de dados reais em seeds, fixtures ou logs.
