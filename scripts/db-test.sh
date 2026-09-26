#!/usr/bin/env bash
# Executa os testes de banco (supabase/tests/*.sql).
#
# Modo padrão: usa o Supabase local (`pnpm db:start`), com as migrações já aplicadas.
# Modo DB_TEST_SHIM=1: usa um PostgreSQL "puro" (ex.: CI) — aplica a simulação do
#   Supabase + migrações (DUAS vezes, para garantir que são idempotentes) + seed.
#   Use somente em banco descartável.
# DB_TEST_SCENARIO=remoto-parcial (com DB_TEST_SHIM=1): prepara um banco no estado
#   "parcialmente migrado à mão" e verifica se as migrações o alinham.
set -euo pipefail

cd "$(dirname "$0")/.."

export DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q)

apply_migrations() {
  for migration in supabase/migrations/*.sql; do
    echo "  • $(basename "$migration")"
    "${PSQL[@]}" -f "$migration" 2>&1 | { grep -v "NOTICE" || true; }
  done
}

if [[ "${DB_TEST_SHIM:-0}" == "1" ]]; then
  echo "→ Aplicando simulação do Supabase (banco descartável)"
  "${PSQL[@]}" -f supabase/tests/support/supabase-shim.sql

  if [[ "${DB_TEST_SCENARIO:-}" == "remoto-parcial" ]]; then
    echo "→ Preparando cenário: remoto parcialmente migrado à mão"
    bash supabase/tests/scenarios/remoto-parcial-setup.sh 2>&1 | { grep -v "NOTICE" || true; }
  fi

  echo "→ Migrações (1ª passagem)"
  apply_migrations
  echo "→ Migrações (2ª passagem — idempotência)"
  apply_migrations

  if [[ "${DB_TEST_SCENARIO:-}" == "remoto-parcial" ]]; then
    "${PSQL[@]}" -f supabase/tests/scenarios/remoto-parcial-check.sql 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  /  /"
    exit 0
  fi
  "${PSQL[@]}" -f supabase/seed.sql
fi

for test_file in supabase/tests/*.sql; do
  echo "→ $(basename "$test_file")"
  "${PSQL[@]}" -o /dev/null -f "$test_file" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  /  /"
done
