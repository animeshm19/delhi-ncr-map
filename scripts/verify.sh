#!/usr/bin/env bash
# Pre-push check: type-check, unit tests and a production build of exactly what is
# committed (a clean checkout of HEAD), the same build Vercel runs.
#   npm run verify
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "Uncommitted changes: commit or stash them so the check matches what you push." >&2
  exit 1
fi
TMP="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$TMP" >/dev/null 2>&1 || true' EXIT
git -C "$ROOT" worktree add --detach "$TMP" HEAD >/dev/null
ln -s "$ROOT/node_modules" "$TMP/node_modules"
cd "$TMP"
npx tsc --noEmit
npx vitest run --reporter=dot
NEXT_TELEMETRY_DISABLED=1 npm run build >/dev/null
echo "✓ $(git rev-parse --short HEAD) type-checks, passes unit tests and builds"
