# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

LOCUS Explorer is a fast, fork-friendly web app for searching and visualizing the complete
[LOCUS-v1](https://huggingface.co/LocalLaws) corpus of ~2.2M U.S. local laws. It ships
full-text search, server-side filtering/pagination, an interactive HTML5 Canvas choropleth
map, and a per-jurisdiction dashboard — in a strict pitch-black (`#000`) + pure-white (`#fff`)
interface with framer-motion throughout. MIT licensed.

This is a **single-folder monorepo** (one root `package.json` / lockfile, one `docker compose`)
with three source folders:

- `app/` — the Next.js 15 web app (App Router, React 19, styled-components, framer-motion).
  Run with `next dev app`; the App Router lives in `app/app/`.
- `server/` — the data-access / query layer (`queryLaws`, `getJurisdictions`,
  `getJurisdictionDetail`). Pure functions; no Next.js.
- `data/` — Prisma schema + migrations, the Prisma client singleton, shared domain types, and
  the seed pipeline.

Dependency direction is `app → server → data`. The thin `/api` route handlers delegate to
`server/queries/*`, which use the Prisma client from `data/db.ts`.

## One-command DevEx

```bash
docker compose up        # or: pnpm up
```

Starts Postgres + the app, applies migrations, sample-seeds (~25k rows) on first run, and
serves the app at http://localhost:3000 with hot reload. The seed is skipped on later runs once
the `laws` table is non-empty (see `docker/entrypoint.sh`).

## Architecture

### Three tiers

- **Presentation (`app/`)**: App Router pages + a single-page shell (`app/app/page.tsx`). UI
  state (selected axis, filters, selected state, open law/about) lives in a small React context
  store (`app/lib/store.tsx`). All styling is styled-components against the tokens in
  `app/lib/theme.ts`; SSR is wired via `app/lib/registry.tsx`.
- **Logic (`server/`)**: `server/queries/laws.ts` builds a parameterized SQL query (full-text
  via `search_vector @@ websearch_to_tsquery`, per-axis range filters, whitelisted sort) and
  runs it with `prisma.$queryRawUnsafe`. `server/queries/jurisdictions.ts` reads the
  pre-computed aggregates.
- **Data (`data/`)**: Postgres via Prisma. `data/db.ts` is the Prisma client singleton;
  `data/types.ts` holds the shared domain types (re-exported by `app/lib/types.ts` so app code
  imports them from `@/lib/types`).

### Map rendering

The map is a **pure HTML5 Canvas** choropleth (`app/components/map/`): `us-atlas` TopoJSON →
`topojson-client` features → `d3-geo` (`geoAlbersUsa` + `geoPath` drawn to a 2D context).
States are colored by the selected axis average using the national `bounds` for the domain;
clicks hit-test via `Path2D` + `ctx.isPointInPath`. `us-atlas` state ids are FIPS codes mapped
to lowercase USPS codes in `app/components/map/fips.ts` to match the dataset.

## Development Commands

```bash
pnpm install            # installs deps; postinstall runs prisma generate (data/prisma)
pnpm dev                # next dev app  -> http://localhost:3000
pnpm build              # next build app
pnpm start              # next start app
pnpm lint               # next lint app
pnpm typecheck          # tsc --noEmit -p app/tsconfig.json (covers app + server + data)

pnpm up                 # docker compose up (full stack)
pnpm up:build           # docker compose up --build
pnpm db:up / db:down    # start / stop local Postgres only

pnpm prisma:deploy      # apply migrations (data/prisma/schema.prisma)
pnpm prisma:migrate     # create/apply a dev migration
pnpm seed --limit 25000 # fast dev sample
pnpm seed               # full ~2.2M-row ingest (resumable, checkpointed)
pnpm seed --fresh       # TRUNCATE laws + jurisdictions + checkpoints, then seed
```

## Project Structure

```text
app/                                # Next.js web app (run via `next dev app`)
  app/                              # App Router: layout, page, api/*
  components/                       # nav, sidebar, map, results, jurisdiction, modal, about
  lib/                              # store, theme, styled-components registry, types re-export
  next.config.ts, tsconfig.json
server/queries/                     # laws.ts, jurisdictions.ts (data-access layer)
data/
  prisma/                           # schema.prisma + migrations (tsvector/GIN)
  db.ts, types.ts, seed.ts, db-count.ts
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

## Important Patterns & Gotchas

- **Next runs from `app/`** (`next dev app`), so `app/next.config.ts` enables
  `experimental.externalDir` to import the sibling `server/` and `data/` folders, and loads the
  repo-root `.env` (Next only auto-loads env from its own project dir). In Docker the DB URLs
  come from compose `environment:` and the loader leaves them untouched.
- **One `.env` at the repo root** serves the app, the seed, and the Prisma CLI.
- **Aliases**: `@/*` → `app/*`, `@server/*` → `server/*`, `@data/*` → `data/*` (see
  `app/tsconfig.json`). `server/` imports `data/` via relative paths.
- **Parameterized SQL only** in `server/queries/laws.ts` — user input is always bound; only
  whitelisted column names / sort directions are interpolated.
- **State codes are lowercase 2-letter** throughout (matches the dataset). Use `stateName()`
  from `data/types.ts` for display.
- **Strict aesthetic**: only `#000` / `#fff` and white-opacity grays via theme tokens.

## Environment Variables

- `DATABASE_URL` — Postgres connection (pooled in production).
- `DIRECT_URL` — direct/non-pooled connection used by Prisma migrations (same as `DATABASE_URL`
  locally).
- `NEXT_PUBLIC_TWEET_URL` — optional announcement link; the About modal shows it only when set.

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
