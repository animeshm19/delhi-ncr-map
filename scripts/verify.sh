#!/usr/bin/env bash
# Pre-push check: type-check, unit tests and a production build of exactly what is
# committed, the same build Vercel runs. Refuses to run with uncommitted changes, so
# the working copy is HEAD (untracked files are refused too).
#   npm run verify
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted or untracked files: commit or stash them so the check matches what you push." >&2
  git status --short >&2
  exit 1
fi
npx tsc --noEmit
npx vitest run --reporter=dot
rm -rf .next
NEXT_TELEMETRY_DISABLED=1 npm run build >/dev/null
echo "✓ $(git rev-parse --short HEAD) type-checks, passes unit tests and builds"
