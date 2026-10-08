#!/usr/bin/env bash
# Download the PostgREST binary used by the end-to-end stack (once, cached).
set -euo pipefail
VERSION="v12.2.12"
DIR="$(cd "$(dirname "$0")/../.." && pwd)/.cache/postgrest"
BIN="$DIR/postgrest"
if [[ -x "$BIN" ]] && "$BIN" --version | grep -q "${VERSION#v}"; then echo "$BIN"; exit 0; fi
mkdir -p "$DIR"
curl -sSfL -o "$DIR/pgrst.tar.xz" "https://github.com/PostgREST/postgrest/releases/download/${VERSION}/postgrest-${VERSION}-linux-static-x86-64.tar.xz"
tar -xJf "$DIR/pgrst.tar.xz" -C "$DIR"
rm -f "$DIR/pgrst.tar.xz"
echo "$BIN"
