# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

visualizelaws.app is a fast, fork-friendly web app for searching and visualizing the complete
[LOCUS-v1](https://huggingface.co/LocalLaws) corpus of ~2.2M U.S. local laws. It ships
full-text search, server-side filtering/pagination, an interactive HTML5 Canvas choropleth
map, and a per-jurisdiction dashboard — in a strict pitch-black (`#000`) + pure-white (`#fff`)
interface with framer-motion throughout. MIT licensed.

It is a standard single Next.js app at the repo root with a dedicated **data layer**:

- `app/` — the App Router (`app/layout.tsx`, `app/page.tsx`, `app/api/*`).
- `components/`, `lib/` — React components and client utilities (theme, store, SSR registry).
- `data/` — the data layer: Prisma schema + migrations, the Prisma client singleton, shared
  domain types, the seed pipeline, and the data-access query functions (`data/queries/*`).

The thin `/api` route handlers delegate to `data/queries/*` (`queryLaws`, `getJurisdictions`,
`getJurisdictionDetail`), which use the Prisma client from `data/db.ts`.

## One-command DevEx

```bash
docker compose up        # or: pnpm up      (25k-row sample on first run)
pnpm up:full             # SEED_LIMIT=0 — load the ENTIRE ~2.2M-row corpus
```

Starts Postgres 18 (the `pgvector/pgvector:pg18` image — stock PG18 with pgvector available but
dormant) + the app, applies migrations, seeds on first run, and serves the app at
http://localhost:3000 with hot reload. The seed is skipped on later runs once the `laws` table is
non-empty (see `docker/entrypoint.sh`). Inspect the DB with Postgres.app or `npx prisma studio`
against `localhost:5432`.

## Architecture

### Layers

- **Presentation (`app/`, `components/`, `lib/`)**: App Router pages + a single-page shell
  (`app/page.tsx`). UI state (selected axis, filters, selected state, open law/about) lives in a
  small React context store (`lib/store.tsx`). All styling is styled-components against the
  tokens in `lib/theme.ts`; SSR is wired via `lib/registry.tsx`.
- **Data access (`data/queries/`)**: `data/queries/laws.ts` builds a parameterized SQL query
  (full-text via `search_vector @@ websearch_to_tsquery`, per-axis range filters, whitelisted
  sort) and runs it with `prisma.$queryRawUnsafe`. `data/queries/jurisdictions.ts` reads the
  pre-computed aggregates.
- **Data (`data/`)**: Postgres via Prisma. `data/db.ts` is the Prisma client singleton;
  `data/types.ts` holds the shared domain types (re-exported by `lib/types.ts` so app code
  imports them from `@/lib/types`).

### Map rendering

The map is a **pure HTML5 Canvas** choropleth (`components/map/`): `us-atlas` TopoJSON →
`topojson-client` features → `d3-geo` (`geoAlbersUsa` + `geoPath` drawn to a 2D context).
States are colored by the selected axis average using the national `bounds` for the domain;
clicks hit-test via `Path2D` + `ctx.isPointInPath`. `us-atlas` state ids are FIPS codes mapped
to lowercase USPS codes in `components/map/fips.ts` to match the dataset.

## Development Commands

```bash
pnpm install            # installs deps; postinstall runs prisma generate (data/prisma)
pnpm dev                # next dev  -> http://localhost:3000
pnpm build              # next build
pnpm start              # next start
pnpm lint               # next lint
pnpm typecheck          # tsc --noEmit

pnpm up                 # docker compose up (full stack; 25k sample first run)
pnpm up:build           # docker compose up --build
pnpm up:full            # full ~2.2M corpus on first boot (SEED_LIMIT=0)
pnpm db:up / db:down    # start / stop local Postgres only

pnpm prisma:deploy      # apply migrations (data/prisma/schema.prisma)
pnpm prisma:migrate     # create/apply a dev migration
pnpm seed --limit 25000 # fast dev sample
pnpm seed               # full ~2.2M-row ingest (resumable, checkpointed)
pnpm seed --fresh       # TRUNCATE laws + jurisdictions + checkpoints, then seed
```

## Project Structure

```text
app/                                # Next.js App Router: layout, page, about/, api/*
components/                         # nav, sidebar, map, results, jurisdiction, modal
lib/                                # store, theme, styled-components registry, types re-export
data/
  prisma/                           # schema.prisma + migrations (tsvector/GIN)
  queries/                          # data-access layer: laws.ts, jurisdictions.ts
  db.ts, types.ts, seed.ts, db-count.ts
next.config.ts, tsconfig.json
Dockerfile, docker-compose.yml, docker/entrypoint.sh
```

## Data Model (Prisma)

- **Law** — one LOCUS-v1 chunk (~2.2M rows): header, content, isSubstantive, function, topic,
  sourceJurisdictionType, state (lowercase 2-letter), city, county, and the four scores
  (opacity, enforcementDiscretion, paternalism, problemSalience). Indexed on state, [state,
  county], function, topic, isSubstantive, each score, plus a generated `search_vector tsvector`
  column with a **GIN** index (defined in the migration SQL — Prisma cannot express GENERATED
  columns; tracked as `Unsupported("tsvector")`).
- **Jurisdiction** — pre-computed aggregates. `level` is `national` or `state`. The single
  `national` row carries corpus-wide averages + per-axis `[min,max]` `bounds` (JSON) used for
  slider domains and the map color scale. (`county` level is a future phase.)
- **SeedCheckpoint** — one row per completed parquet shard, for resumable seeding.

## Seeding

`data/seed.ts` streams the 8 LOCUS-v1 parquet shards (`@dsnp/parquetjs`), bulk-loads `laws` via
Postgres `COPY` (`pg` + `pg-copy-streams`) in ~10k-row batches, checkpoints each shard inside a
transaction (crash-safe resume), then recomputes the `jurisdictions` aggregates. `search_vector`
is generated automatically and never written by the seeder.
The corpus is **not** in git (~1.77 GB). `docker compose up` sample-seeds `SEED_LIMIT` rows
(default 25000) only when `laws` is empty; set `SEED_LIMIT=0` for the full ~2.2M-row corpus. Or
seed directly: `pnpm seed` (host, against the Docker Postgres) or `docker compose exec app pnpm seed`.

## Important Patterns & Gotchas

- **Standard root app**: the Next.js app is at the repo root (`next dev`), so Next auto-loads the
  root `.env` and compiles `data/` normally — no `externalDir` or custom env loader. In Docker
  the DB URLs come from compose `environment:`.
- **One `.env` at the repo root** serves the app, the seed, and the Prisma CLI.
- **Alias**: `@/*` → repo root (see `tsconfig.json`); route handlers import `@/data/queries/*`
  and `data/queries/*` import the client/types via relative paths.
- **Parameterized SQL only** in `data/queries/laws.ts` — user input is always bound; only
  whitelisted column names / sort directions are interpolated.
- **State codes are lowercase 2-letter** throughout (matches the dataset). Use `stateName()`
  from `data/types.ts` for display.
- **Strict aesthetic**: only `#000` / `#fff` and white-opacity grays via theme tokens.
- **Docker bind mount is path-bound**: the `app` service mounts the project dir at `/workspace`
  via an absolute host path captured at container-create time. Renaming/moving the folder breaks
  it (empty `/workspace`); the entrypoint fails fast — recreate with `docker compose up -d
  --force-recreate` (data persists in the named volume).

## Environment Variables

- `DATABASE_URL` — Postgres connection (pooled in production).
- `DIRECT_URL` — direct/non-pooled connection used by Prisma migrations (same as `DATABASE_URL`
  locally).
- `SEED_LIMIT` — rows `docker compose up` sample-seeds on first boot (default 25000); 0 = full corpus.

## Git Workflow

Branch from `main`, never commit to `main` directly, open PRs to `main`. PR titles + commit
messages follow Conventional Commits. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Future Phases (tracked as GitHub issues)

Not built yet; good first issues to file:

1. **Score New Law** (lead premium feature) — `POST /api/score` + UI running arbitrary text
   through the four HF LocalLaws scorer models, behind a configurable `HF_INFERENCE_BASE_URL`.
   Strong fit for the first USDC-gated unlock.
2. **USDC / agentic payments** — open-core monetization gating premium capability while the MIT
   core stays free.
3. **County-level map** — extend the choropleth + aggregates to `level='county'`.
