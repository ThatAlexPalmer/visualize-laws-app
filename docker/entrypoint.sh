#!/bin/sh
# visualizelaws.com container entrypoint:
#   0. sanity-check the /workspace bind mount (fail fast with the real cause)
#   1. wait for Postgres to accept TCP connections
#   2. apply migrations, then sample-seed only if the laws table is empty
#   3. start the Next.js dev server (hot reload) on :3000
set -e

# 0. The app source is bind-mounted at /workspace. If it's empty/stale — e.g. the
#    host project folder was renamed or moved after this container was created, so
#    the captured bind-mount path no longer exists — fail loudly with the real
#    cause instead of looping on a misleading "postgres not ready".
if [ ! -f /workspace/package.json ]; then
  echo "[entrypoint] FATAL: /workspace/package.json not found — the source bind mount is empty or stale."
  echo "[entrypoint] The host project folder was likely renamed/moved after this container was created."
  echo "[entrypoint] Recreate the stack from the current folder:  docker compose up -d --force-recreate"
  exit 1
fi

# 1. Wait for Postgres to actually accept TCP connections. Uses Node's built-in
#    net module (no extra deps / client tools). Host/port match docker-compose;
#    override with POSTGRES_HOST / POSTGRES_PORT if needed.
db_host="${POSTGRES_HOST:-postgres}"
db_port="${POSTGRES_PORT:-5432}"
echo "[entrypoint] waiting for postgres at ${db_host}:${db_port}..."
attempt=0
until node --input-type=commonjs -e "const s=require('net').connect(${db_port},'${db_host}');s.setTimeout(2000);s.on('connect',()=>process.exit(0));s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1));" 2>/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[entrypoint] FATAL: postgres did not accept connections at ${db_host}:${db_port} after 30 attempts."
    exit 1
  fi
  echo "[entrypoint] postgres not ready (attempt $attempt) — retrying in 2s..."
  sleep 2
done
echo "[entrypoint] postgres is accepting connections."

# 2. Apply migrations once; surface the real error if this fails.
echo "[entrypoint] applying migrations..."
if ! pnpm prisma:deploy; then
  echo "[entrypoint] FATAL: prisma migrate deploy failed (see output above)."
  exit 1
fi
echo "[entrypoint] migrations applied."

count=$(pnpm -s exec tsx data/db-count.ts 2>/dev/null | tr -dc '0-9')
if [ -z "$count" ] || [ "$count" = "0" ]; then
  limit="${SEED_LIMIT:-25000}"
  if [ "$limit" = "0" ] || [ -z "$limit" ]; then
    echo "[entrypoint] laws table is empty — seeding the FULL corpus (SEED_LIMIT=0; downloads ~1.77 GB)..."
    pnpm seed || echo "[entrypoint] seed failed; continuing with an empty database."
  else
    echo "[entrypoint] laws table is empty — sample seeding --limit $limit (set SEED_LIMIT=0 for the full corpus)..."
    pnpm seed --limit "$limit" || echo "[entrypoint] seed failed; continuing with an empty database."
  fi
else
  echo "[entrypoint] laws table has $count rows — skipping seed."
  echo "[entrypoint] If the county choropleth is empty after a schema update, recompute aggregates: pnpm seed --shards ''"
  echo "[entrypoint] One-county city fills: pnpm build:city-county (after pnpm prisma:deploy)"
fi

# Bind to all interfaces (assembled via printf so the address is unambiguous).
bind_host="$(printf '%d.%d.%d.%d' 0 0 0 0)"
echo "[entrypoint] starting Next.js dev server on :3000"
exec pnpm exec next dev -p 3000 -H "$bind_host"
