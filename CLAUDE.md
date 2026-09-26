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
- Tabelas `core.editais`/`core.projetos` (ADR-0010). Vocabulário de projetos em `packages/modules/projects/src/vocabulary.ts` = CHECK constraints da migração.
- Match (`packages/modules/funding`): regras determinísticas; nunca afirmar aprovação (`MATCH_DISCLAIMER`).
- Documentos de editais: bucket privado `edital-documents` (`<org_id>/...`), `core.edital_documents` com SHA-256 imutável (ADR-0011). Buscar URLs externas só via `safeFetch` de `@lep/ingestion` (anti-SSRF).
- Tema: use tokens de `globals.css` (`bg-surface`, `bg-card`, `text-fg`, `text-muted`, `text-brand`), nunca cores soltas.
- Dados da LEP são sigilosos: nada de dados reais em seeds, fixtures ou logs.
