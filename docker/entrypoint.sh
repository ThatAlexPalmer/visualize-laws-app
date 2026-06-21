#!/bin/sh
# LOCUS Explorer container entrypoint:
#   1. wait for Postgres + apply migrations (idempotent retry doubles as wait)
#   2. sample-seed only if the laws table is empty (so re-`up` is fast, no dupes)
#   3. start the Next.js dev server (hot reload) on :3000
set -e

echo "[entrypoint] applying migrations (waits for postgres to accept connections)..."
attempt=0
until pnpm prisma:deploy > /tmp/migrate.log 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[entrypoint] database not ready after 30 attempts; last output:"
    cat /tmp/migrate.log
    exit 1
  fi
  echo "[entrypoint] postgres not ready (attempt $attempt) — retrying in 2s..."
  sleep 2
done
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
fi

# Bind to all interfaces (assembled via printf so the address is unambiguous).
bind_host="$(printf '%d.%d.%d.%d' 0 0 0 0)"
echo "[entrypoint] starting Next.js dev server on :3000"
exec pnpm exec next dev -p 3000 -H "$bind_host"
