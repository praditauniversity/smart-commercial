#!/bin/sh
set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$SCRIPT_DIR/migration.env"
[ -f "$ENV_FILE" ] || { echo "Copy .env.migration.example to migration.env and fill in both endpoints." >&2; exit 1; }

set -a
. "$ENV_FILE"
set +a
: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL in migration.env}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL in migration.env}"
: "${SOURCE_SUPABASE_PUBLIC_URL:?Set SOURCE_SUPABASE_PUBLIC_URL in migration.env}"
: "${SUPABASE_PUBLIC_URL:?Set SUPABASE_PUBLIC_URL in migration.env}"
command -v docker >/dev/null 2>&1 || { echo "Docker is required to run PostgreSQL client tools in the local database container." >&2; exit 1; }

mkdir -p "$SCRIPT_DIR/backups"
DUMP_FILE="$SCRIPT_DIR/backups/bima-public-$(date +%Y%m%d-%H%M%S).dump"
echo "Exporting the public schema to $DUMP_FILE"
docker exec -e SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" supabase-db \
  sh -c 'pg_dump --format=custom --no-owner --no-acl --schema=public --file=/tmp/bima-public.dump "$SOURCE_DATABASE_URL"'
docker cp supabase-db:/tmp/bima-public.dump "$DUMP_FILE"
docker exec supabase-db rm -f /tmp/bima-public.dump

echo "Restoring the public schema into local Supabase"
docker cp "$DUMP_FILE" supabase-db:/tmp/bima-public.dump
docker exec supabase-db pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --single-transaction \
  --username=postgres --dbname=postgres /tmp/bima-public.dump
docker exec supabase-db rm -f /tmp/bima-public.dump

echo "Repointing copied media URLs to the Tailscale Storage endpoint"
docker exec -i -e SOURCE_SUPABASE_PUBLIC_URL="$SOURCE_SUPABASE_PUBLIC_URL" \
  -e SUPABASE_PUBLIC_URL="$SUPABASE_PUBLIC_URL" supabase-db \
  sh -c 'psql --set=ON_ERROR_STOP=1 --username=postgres --dbname=postgres \
    --set=source_base="$SOURCE_SUPABASE_PUBLIC_URL" \
    --set=target_base="$SUPABASE_PUBLIC_URL" --file=-' \
  < "$SCRIPT_DIR/rewrite-media-urls.sql"

echo "Database copy complete. Backup retained at $DUMP_FILE"
