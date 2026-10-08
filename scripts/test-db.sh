#!/usr/bin/env bash
# Database tests: builds a throwaway database from the real migrations + seed and
# runs every supabase/tests/*.test.sql file against it, each in its own transaction.
#
#   TEST_DATABASE_URL=postgresql://postgres@localhost:54322/postgres npm run test:db
#
# Uses plain Postgres + PostGIS with supabase/tests/supabase_shim.sql standing in
# for Supabase. It refuses to run against a hosted Supabase project.
set -euo pipefail

BASE_URL="${TEST_DATABASE_URL:-postgresql://postgres@localhost:54322/postgres}"
if [[ "$BASE_URL" == *supabase.co* || "$BASE_URL" == *supabase.com* ]]; then
  echo "Refusing to run destructive tests against a hosted Supabase database." >&2
  exit 1
fi

DB="dncr_test_$$"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN_URL="$BASE_URL"
TEST_URL="${BASE_URL%/*}/$DB"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

cleanup() { "${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" "$ADMIN_URL" -c "create database $DB" >/dev/null
"${PSQL[@]}" "$TEST_URL" -f "$ROOT/supabase/tests/supabase_shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" "$TEST_URL" -f "$f" >/dev/null 2>"$ROOT/.db-test.log" || { echo "Migration failed: $f"; cat "$ROOT/.db-test.log"; exit 1; }
done
"${PSQL[@]}" "$TEST_URL" -f "$ROOT/supabase/seed.sql" >/dev/null 2>"$ROOT/.db-test.log" || { echo "Seed failed"; cat "$ROOT/.db-test.log"; exit 1; }
rm -f "$ROOT/.db-test.log"

pass=0; fail=0
for t in "$ROOT"/supabase/tests/*.test.sql; do
  name="$(basename "$t")"
  if out=$( { echo "begin;"; cat "$t"; echo "rollback;"; } | "${PSQL[@]}" "$TEST_URL" 2>&1 ); then
    n=$(grep -c "NOTICE:  ok - " <<<"$out" || true)
    pass=$((pass + n))
    echo "✓ $name ($n checks)"
  else
    fail=$((fail + 1))
    echo "✗ $name"
    grep -E "ok - |ERROR" <<<"$out" | sed 's/^/    /'
  fi
done
echo
echo "$pass checks passed, $fail files failed"
[[ $fail -eq 0 ]]
