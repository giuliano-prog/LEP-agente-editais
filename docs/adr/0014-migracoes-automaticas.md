# ADR-0014 — Migrações idempotentes e aplicação automática em produção

**Status:** Aceita (2026-09-26)

## Contexto

Migrações aplicadas manualmente e fora de ordem pelo SQL Editor deixaram o banco de produção em estado
parcial (erro "column review_status of relation core.editais does not exist" ao rodar a 20260928 sem a 20260926).

## Decisão

1. **Toda migração é idempotente:** pode rodar sobre banco vazio, parcial ou já migrado com o mesmo resultado
   (`if not exists`, `create or replace function`, `drop trigger/policy if exists` + `create`, tipos em bloco `do`).
   O CI aplica todas as migrações **duas vezes** e também sobre um cenário "remoto parcialmente migrado à mão"
   (`supabase/tests/scenarios/`).
2. **Produção só por automação:** o workflow `.github/workflows/supabase-migrations.yml` roda em cada push no branch
   de produção (variável `SUPABASE_MIGRATIONS_BRANCH`, padrão `main`) que altere `supabase/migrations/`, e
   manualmente (Run workflow). Etapas: testar migrações em banco descartável →
   `supabase db push --db-url … --dry-run` → `supabase db push --db-url … --include-all` → `supabase migration list`.
   Nunca roda duas vezes em paralelo nem é cancelado.
3. **Conexão direta ao PostgreSQL, sem Management API** (revisado em 2026-09-26): `supabase link` exigia
   permissões crescentes do token pessoal (`project_admin_read`, `api_gateway_keys_read`). A única credencial é
   `SUPABASE_DB_URL` (Session pooler, porta 5432), guardada como segredo do ambiente `production`
   (permite exigir aprovação manual). O workflow valida o formato e mascara a senha nos logs.
4. O `seed.sql` (dados fictícios) **nunca** é aplicado em produção.

## Consequências

- Não usar mais o SQL Editor para migrações. O script `supabase/scripts/diagnostico.sql` continua permitido (somente leitura).
- A Vercel publica o app em paralelo às migrações (~1–2 min); o app tolera colunas ainda ausentes e o Diagnóstico
  mostra o que falta.
