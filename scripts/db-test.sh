#!/usr/bin/env bash
# Executa os testes de banco (supabase/tests/*.sql).
#
# Modo padrão: usa o Supabase local (`pnpm db:start`), com as migrações já aplicadas.
# Modo DB_TEST_SHIM=1: usa um PostgreSQL "puro" (ex.: CI) — aplica a simulação do
#   Supabase + migrações + seed antes dos testes. Use somente em banco descartável.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q)

if [[ "${DB_TEST_SHIM:-0}" == "1" ]]; then
  echo "→ Aplicando simulação do Supabase, migrações e seed (banco descartável)"
  "${PSQL[@]}" -f supabase/tests/support/supabase-shim.sql
  for migration in supabase/migrations/*.sql; do
    echo "  • $(basename "$migration")"
    "${PSQL[@]}" -f "$migration"
  done
  "${PSQL[@]}" -f supabase/seed.sql
fi

for test_file in supabase/tests/*.sql; do
  echo "→ $(basename "$test_file")"
  "${PSQL[@]}" -o /dev/null -f "$test_file" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  /  /"
done
