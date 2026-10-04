# Local Supabase for Bima

This directory contains the official Supabase self-hosted Docker stack pinned at
`self-hosted/v0.8.2`, plus a small Compose override that connects Bima to Postgres
and the API gateway on the private `bima-supabase-app` network. The upstream files
are from commit `564eab8ad7840b13324f68b1bfac074ef8d51c21`.

## First start

1. Create the shared Docker network once: `docker network create bima-supabase-app`.
2. Copy `.env.example` to `.env`, set `SUPABASE_PUBLIC_URL` and `API_EXTERNAL_URL`
   to Bima's HTTPS Tailscale hostname on port `10000`, then generate unique keys:
   `sh utils/generate-keys.sh --update-env` followed by
   `sh utils/add-new-auth-keys.sh --update-env`.
3. Check the generated `.env` has `API_GW_HTTP_PORT=127.0.0.1:8010`,
   `POSTGRES_BIND_ADDRESS=127.0.0.1`, and the Bima Compose override in
   `COMPOSE_FILE`.
4. Start Supabase with `sh run.sh start`. The API gateway and database are bound
   to host loopback; Postgres and the gateway are also reachable from Bima over
   the private Docker network.
5. Publish the gateway to tailnet users:
   `tailscale serve --bg --https=10000 http://127.0.0.1:8010`.
6. Copy `web/.env` to `web/.env.local` and `ai-service/.env` to
   `ai-service/.env.local`. In the copies, set both app configurations to the
   local database, generated service key, and public Tailscale URL. In the root
   `.env.local`, set `WEB_ENV_FILE=./web/.env.local`,
   `AI_ENV_FILE=./ai-service/.env.local`, and
   `SUPABASE_INTERNAL_URL=http://supabase-api:8000`. Keep the cloud `.env` files
   intact for rollback. Use
   `postgresql://postgres:<POSTGRES_PASSWORD>@supabase-db:5432/postgres` for
   both database URLs in `web/.env.local`. Rebuild Bima because
   `NEXT_PUBLIC_SUPABASE_URL` is baked into the browser bundle.
7. From the Bima root, apply the app schema with the local env files:
   `docker compose -p bima-web-local --env-file .env.local --profile tools run --rm migrate`.
8. Create Bima's public Storage buckets without copying cloud objects:
   fill `TARGET_SUPABASE_URL` and `TARGET_SUPABASE_SERVICE_ROLE_KEY` in private
   `migration.env`, then run `./migrate-storage.sh --init-only`.
9. Start Bima locally alongside the existing Cloud app with
   `docker compose -p bima-web-local --env-file .env.local up -d --build`.
   The default local web port is `3101`; publish it on the tailnet with
   `tailscale serve --bg --https=8444 http://127.0.0.1:3101`.

Supabase Studio is available at the gateway root from the host or tailnet URL;
its dashboard credentials are `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` in
the Supabase `.env`.

## Cloud data and media migration

Do not change the current Bima `.env` files until the local stack is healthy.
Copy `.env.migration.example` to `migration.env` and fill it with the cloud
source database URL (use the direct connection), cloud Storage URL and service
role key, local database URL (`127.0.0.1:5433`), local API URL
(`http://127.0.0.1:8010`), local service role key, and public Tailscale URL.
Keep `migration.env` private; it is git-ignored.

When cloud database access is available, run these steps while the app is in
maintenance mode so the copy is consistent. To use a fresh local database, apply
the app schema and initialize the two buckets above; leave the cloud data untouched.

1. `./migrate-database.sh` exports and restores the `public` schema, then updates
   media URLs in `MediaAsset`, `MediaSegment`, and review snapshots to the local
   Tailscale origin. The private dump is retained under `backups/`.
2. `./migrate-storage.sh` copies all objects from public buckets `img` and
   `vids`, preserving object paths and making the destination buckets public.
   It can be rerun safely; destination objects are upserted.
3. Compare table and object counts, test media URLs from a tailnet browser, and
   exercise login, sessions, upload, processing, review, and deletion before
   declaring local primary. Keep cloud Supabase unchanged during this window.

The Storage transfer holds one object in memory at a time. The local bucket and
global Storage size limits are set to 1 GiB to accommodate Bima's 20-minute
compressed video uploads.

## Operations

- Supabase data lives under `volumes/`; `docker compose down` preserves it.
- Back up PostgreSQL and `volumes/storage` before upgrades. The SQL dump created
  by the migration helper is not a recurring backup strategy.
- Only expose the HTTPS Tailscale gateway. Keep dashboard and database ports on
  loopback, and restrict Tailscale access through the tailnet ACL.
- Follow the pinned upstream release notes before changing `.supabase-version`
  or updating image tags.
