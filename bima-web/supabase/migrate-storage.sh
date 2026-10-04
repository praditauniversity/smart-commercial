#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$SCRIPT_DIR/migration.env"
[ -f "$ENV_FILE" ] || { echo "Copy .env.migration.example to migration.env and fill in both endpoints." >&2; exit 1; }

set -a
. "$ENV_FILE"
set +a

cd "$ROOT_DIR/web"
if [ "${1:-}" = "--init-only" ]; then
  npm run storage:init
else
  npm run migrate:storage
fi
