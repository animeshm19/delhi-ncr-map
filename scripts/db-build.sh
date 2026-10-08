#!/usr/bin/env bash
# Build a database from the Supabase stand-in, the real migrations and the seed.
#   scripts/db-build.sh <postgres-url-of-new-db>
# The database must already exist and be empty. Refuses hosted Supabase URLs.
set -euo pipefail
URL="$1"
if [[ "$URL" == *supabase.co* || "$URL" == *supabase.com* ]]; then
  echo "Refusing to build test data in a hosted Supabase database." >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 "$URL")
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_shim.sql" >/dev/null 2>"$LOG" || { echo "Shim failed"; cat "$LOG"; exit 1; }
for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" >/dev/null 2>"$LOG" || { echo "Migration failed: $f"; cat "$LOG"; exit 1; }
done
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql" >/dev/null 2>"$LOG" || { echo "Seed failed"; cat "$LOG"; exit 1; }
