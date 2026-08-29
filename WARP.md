# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

visualizelaws.com is a fast, fork-friendly web app for searching and visualizing the complete
[LOCUS-v1](https://huggingface.co/LocalLaws) corpus of ~2.2M U.S. local laws. It ships
full-text search, server-side filtering/pagination, an interactive HTML5 Canvas choropleth
map, and a per-jurisdiction dashboard — in a strict pitch-black (`#000`) + pure-white (`#fff`)
interface with framer-motion throughout. Business Source License 1.1 (BUSL-1.1).

Deployed in production on Vercel at https://visualizelaws.com (Prisma Postgres + Cloudflare DNS).

It is a standard single Next.js app at the repo root with a dedicated **data layer**:

- `app/` — the App Router (`app/layout.tsx`, `app/page.tsx`, `app/api/*`).
- `components/`, `lib/` — React components and client utilities (theme, store, SSR registry).
- `data/` — the data layer: Prisma schema + migrations, the Prisma client singleton, shared
  domain types, the seed pipeline, and the data-access query functions (`data/queries/*`).

The thin `/api` route handlers delegate to `data/queries/*` (`queryLaws`, `getLawById`,
`getJurisdictions`, `getJurisdictionDetail`, `resolvePlace`), which use the Prisma client
from `data/db.ts`. `/api/laws` returns row *summaries* and `/api/laws/[id]` returns the
full law on demand. `GET /api/jurisdictions` without params is the US map payload
(state + national only) and may be CDN-cached briefly (`s-maxage=60`) when complete;
`national: null` / empty rows are not cached. `?city=` / `?county=` lookup and
`/api/jurisdictions/[state]` stay `no-store`. Do not use hour-long / `force-static`
cache on these routes.

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

The map is a **pure HTML5 Canvas** choropleth (`components/map/`). Geometry is baked once
into a fixed Albers USA world (`geo.ts` `usProjection`, 960×600). Zoom tweens a camera
`{k, tx, ty}` (`camera.ts`) and `setTransform`s; it does **not** `fitExtent` or
`new Path2D` on zoom, resize, or incoming county scores.

- Mesh: 50 state Path2Ds on mount; 3,231 county Path2Ds after a lazy
  `us-atlas/counties-10m.json` import (kept out of the initial JS bundle).
- Color: native `level='county'` rows plus one-county city stand-ins (`county_fills`).
  Multi-county cities are not painted. Cities have no polygons of their own.
- US view fills states. Inside a state, only that state's county outlines are stroked;
  scored/joined counties fill when **n ≥ 8** (native + stand-ins). If n &lt; 8, outlines
  + a line of copy (`sparseCounties.ts`); no county legend. Unscored hover is
  `{Name} · no data`. A stand-in hover is `{County} · {City} code`.
- Hit-test inverts the camera, then `isPointInPath` on the baked paths. Zoom-out drops
  the county mesh immediately (states only).
- FIPS → lowercase USPS is `components/map/fips.ts`. Place slugs join in `data/slugs.ts`.
  City stand-ins join by Census FIPS (`joinCountyFills`).
- QuickSearch may zoom to a state and highlight a county; it does not remesh.

## Development Commands

```bash
pnpm install            # installs deps; postinstall runs prisma generate (data/prisma)
pnpm dev                # next dev  -> http://localhost:3000
pnpm build              # next build
pnpm start              # next start
pnpm lint               # eslint .  (Next 16 removed `next lint`)
pnpm typecheck          # tsc --noEmit
pnpm test               # tsx --test (city/county, map, place lookup, laws)

pnpm up                 # docker compose up (full stack; 25k sample first run)
pnpm up:build           # docker compose up --build
pnpm up:full            # full ~2.2M corpus on first boot (SEED_LIMIT=0)
pnpm db:up / db:down    # start / stop local Postgres only
pnpm db:studio          # prisma studio --schema data/prisma/schema.prisma

pnpm prisma:deploy      # apply migrations (data/prisma/schema.prisma)
pnpm prisma:migrate     # create/apply a dev migration
pnpm seed --limit 25000 # fast dev sample (Alaska-only; shard 0)
pnpm seed --fresh --shards 1 --limit 25000  # Colorado QA (pagosa_springs, el_paso_county)
pnpm seed --shards ''   # recompute aggregates + city_county / county_fills
pnpm build:city-county  # Census join + stand-in fills only (no parquet COPY)
pnpm build:fines        # LOCUS-Fines penalty layer only (~40s on a full corpus)
pnpm seed               # full ~2.2M-row ingest (resumable, checkpointed)
pnpm seed --fresh       # TRUNCATE laws + jurisdictions + checkpoints, then seed
pnpm seed:prod …        # same flags against .env.prod (remote admin only)
```

Full agent seed runbook (timings, remote stalls, verify queries): `agents/AGENTS.md`.

## Project Structure

```text
app/                                # Next.js App Router: layout, page, about/, api/*
components/                         # nav, sidebar, map, results, jurisdiction, modal
lib/                                # store, theme, styled-components registry, types re-export
data/
  prisma/                           # schema.prisma + migrations (tsvector/GIN, city indexes)
  queries/                          # laws.ts, jurisdictions.ts (incl. resolvePlace)
  slugs.ts, cityCounty.ts           # place keys + Census city→county join
  db.ts, types.ts, seed.ts, db-count.ts, build-city-county.ts
components/map/                     # canvas map: geo.ts, camera.ts, sparseCounties.ts, MapPanel.tsx
next.config.ts, tsconfig.json, eslint.config.mjs
Dockerfile, docker-compose.yml, docker/entrypoint.sh
```

## Data Model (Prisma)

- **Law** — one LOCUS-v1 chunk (~2.2M rows): header, content, isSubstantive, function, topic,
  sourceJurisdictionType, state (lowercase 2-letter), city, county, and the four scores
  (opacity, enforcementDiscretion, paternalism, problemSalience). City and county are
  mutually exclusive in the corpus. Indexed on state, `[state, county]`, `[state, city]`,
  function, topic, isSubstantive, each score, county/city trigram GIN, plus a generated
  `search_vector tsvector` GIN (migration SQL — Prisma cannot express GENERATED columns;
  tracked as `Unsupported("tsvector")`).
- **Jurisdiction** — pre-computed aggregates. `level` is `national` | `state` | `county`.
  The single `national` row carries corpus-wide averages + per-axis `[min,max]` `bounds`
  (JSON) for sliders and the US color scale. County rows (~376 on a full seed) color
  in-state polygons only; they are **not** the mesh. Unique key is `(level, state, county)`.
- **CityCounty** — Census 2020 place join for LOCUS city slugs (`state`, `city` unique).
- **CountyFill** — map-layer sibling to `jurisdictions` (`source` = `county` | `city`).
  Do not reuse `(level, state, county)` for stand-ins.
- **SeedCheckpoint** — one row per completed parquet shard, for resumable seeding.
- **LawFine** — [LOCUS-Fines](https://huggingface.co/datasets/LocalLaws/LOCUS-Fines)
  penalty annotation, unique on `law_id` (FK → `laws`, `ON DELETE CASCADE`). Only the
  **632,005 model-read rows** (`annotation_source = 'LLM'`) are stored: every dollar
  amount and every model judgement lives on one. A missing row means *not read by the
  model* — **not** "this law has no penalty." 83,625 rows carry an amount. Denormalizes
  `state` / `city` / `county` for per-place aggregates and keeps `content_sha1` so a
  rebuild is verifiable.

### Fines layer

`data/build-fines.ts` streams the single ~87 MB supplement parquet, keeps model-read
rows, `COPY`s them into an unlogged staging table, then one server-side `INSERT ... SELECT`
dedupes and hash-joins them onto `laws`. `data/fines.ts` holds the pure helpers.

- The supplement ships **no law text**. Rows re-attach on seven identity columns whose
  last member is `content_sha1` = `sha1(content)` truncated to 16 hex chars, recomputed
  in Postgres via pgcrypto `digest` (core PG has md5/sha2 but no sha1).
- That key is **not unique** in LOCUS-v1 (2,411 duplicate groups / 5,200 rows), so the
  fines side is deduped with `DISTINCT ON` before the join. Skipping that fans out.
- NULL `city` / `county` normalize to `''` on both sides so every predicate stays a
  hashable equality. `IS NOT DISTINCT FROM` is correct but unhashable and collapses the
  plan into a nested loop over 2.2M rows.
- Rebuild-in-place and idempotent: re-running yields identical counts.

## Seeding

`data/seed.ts` streams the 8 LOCUS-v1 parquet shards (`@dsnp/parquetjs`), bulk-loads `laws` via
Postgres `COPY` (`pg` + `pg-copy-streams`) in **5k-row batches** (commit per batch), tracks
intra-shard progress in `.locus-cache/seed-progress.json`, writes a `seed_checkpoints` row when a
shard finishes, then recomputes `jurisdictions`. `search_vector` is generated automatically and
never written by the seeder. Remote/managed Postgres can stall mid-COPY; the seeder uses short
load-phase timeouts + a COPY watchdog + reconnect retries (see `agents/AGENTS.md`).

The corpus is **not** in git (~1.77 GB). `docker compose up` sample-seeds `SEED_LIMIT` rows
(default 25000) only when `laws` is empty; set `SEED_LIMIT=0` for the full ~2.2M-row corpus. Or
seed directly: `pnpm seed` (host, against the Docker Postgres) or `docker compose exec app pnpm seed`.

### Realistic duration (order of magnitude)

- Local sample (`--limit 25000` / default compose): **~1–5 min**
- Local full corpus (Docker Postgres, shards cached): **~15–40 min**
- Remote full fresh (`pnpm seed:prod --fresh` from laptop → managed Postgres): **~30–60+ min**,
  with occasional silent stalls; resume without `--fresh` is expected
- Fines layer on a full corpus (`pnpm build:fines`, parquet cached): **well under a minute**
- Verify: `laws` ≈ **2,211,516**, `seed_checkpoints` = **8**, jurisdictions `national`=1 +
  one `state` per distinct code (~50) + ~**376** `county` rows (full corpus), `law_fines`
  = **632,005** (**83,625** with an amount). Existing DBs that skipped docker seed after
  the city-index migration need `pnpm seed --shards ''`; ones predating the fines
  migration need `pnpm prisma:deploy` then `pnpm build:fines`.

Maintainer/agent detail (single-writer, background logs, verify SQL): **`agents/AGENTS.md`**.
Do not expand public `README.md` with remote DB / internal agent ops.

## Important Patterns & Gotchas

- **Standard root app**: the Next.js app is at the repo root (`next dev`), so Next auto-loads
  `.env.local` and compiles `data/` normally — no `externalDir` or custom env loader. In Docker
  the DB URLs come from compose `environment:`.
- **Env files**: `.env.local` (local dev, auto-loaded by Next) and `.env.prod` (remote admin: migrate/seed), both gitignored; `.env.example` is the tracked template. The DB/seed scripts choose the file via `dotenv-cli` (`pnpm prisma:deploy`/`pnpm seed` use `.env.local`; `pnpm prisma:deploy:prod`/`pnpm seed:prod` use `.env.prod`).
- **Alias**: `@/*` → repo root (see `tsconfig.json`); route handlers import `@/data/queries/*`
  and `data/queries/*` import the client/types via relative paths.
- **Parameterized SQL only** in `data/queries/laws.ts` — user input is always bound; only
  whitelisted column names / sort directions are interpolated. Place search boosts slug
  hits with `IS TRUE` (nullable city/county `OR` is NULL and sorts first under DESC).
- **State codes are lowercase 2-letter** throughout (matches the dataset). Use `stateName()`
  from `data/types.ts` for display. Place slugs stay as stored (`pagosa_springs`); pretty-print
  in the UI. Do **not** rewrite `laws.county` / `laws.city` to Census names (breaks LOCUS-v1
  re-seed and additive shards).
- **Empty county polygons are coverage, not a render bug** (issue #25). ~3,231 atlas
  shapes vs ~376 scored counties. Never invent county averages from city laws. Never
  special-case a state.
- **The two parquet readers are not interchangeable.** `data/seed.ts` uses
  `@dsnp/parquetjs` for the LOCUS-v1 shards (~56k-row row groups); `data/build-fines.ts`
  uses `hyparquet` because LOCUS-Fines packs **1,048,576-row row groups** and
  `@dsnp/parquetjs` materializes a whole row group — it OOMs at the default heap and
  needs ~7.75 GB RSS. `hyparquet` reads bounded row ranges and peaks near 1.2 GB. Do not
  "unify" these on the parquetjs reader.
- **`--fresh` must truncate `law_fines`** — it holds an FK to `laws`, so Postgres rejects
  the TRUNCATE otherwise, and its rows are keyed by law id, which is not stable across a
  fresh load. Rebuild it afterwards (the seeder does).
- **Fine amounts are model output, not ground truth.** Amounts are verified against the
  source text but the categorical fields are not, and a number meaning something else
  (a bond, a fee cap) is occasionally read as a fine — the largest stored values are such
  cases. Prefer medians over means, and surface `grounded = false` / non-null
  `extraction_flag` as a caveat rather than hiding those rows.
- Prisma **drops/resets** a shadow database. Never pass a URL that has data (local
  Docker or remote) as `--shadow-database-url`. Never `migrate reset` / `db push`
  against a database you care about. Apply with `prisma:deploy` / `prisma:deploy:prod`.
  `pnpm prisma:migrate` only when **authoring** a new migration, locally. Do not use
  it to “fix” `search_vector` drift (`DROP DEFAULT` breaks FTS). `--fresh` truncates
  `laws` — never on production unless explicitly asked.
- **Map zoom** must not remesh: no `fitExtent` / `new Path2D` on select, data, or resize.
- **Strict aesthetic**: only `#000` / `#fff` and white-opacity grays via theme tokens.
- **Docker bind mount is path-bound**: the `app` service mounts the project dir at `/workspace`
  via an absolute host path captured at container-create time. Renaming/moving the folder breaks
  it (empty `/workspace`); the entrypoint fails fast — recreate with `docker compose up -d
  --force-recreate` (data persists in the named volume).
- **Supported Next line is 16.x** (`next` + `eslint-config-next` together). Do not take a
  Dependabot major for Next, ESLint, TypeScript, or `@types/node` — those are deliberate
  maintainer upgrades. Cache Components / Instant Navigations stay off unless a feature asks.
  `eslint.config.mjs` keeps React Compiler rules off so canvas/map/store effects stay valid.
- **`pnpm.overrides`** in `package.json` pin transitive packages whose parents have not
  published a safe range (Nano ID 3.3.18, js-yaml, brace-expansion). Remove an override when
  the parent tree already resolves the patched version. Do **not** major-override Prisma's
  `deepmerge-ts@7` (alert #27: trusted local Prisma config only; no patched parent in 6.x/7.x).

## Environment Variables

- `DATABASE_URL` — Postgres connection (pooled in production).
- `DIRECT_URL` — direct/non-pooled connection used by Prisma migrations (same as `DATABASE_URL`
  locally).
- `SEED_LIMIT` — rows `docker compose up` sample-seeds on first boot (default 25000); 0 = full corpus.
## Deployment

Live in production on Vercel at https://visualizelaws.com (Prisma Postgres + Cloudflare DNS). CI runs
`verify` (lint + typecheck + test) on PRs; Vercel builds and deploys on merge to `main`. The production
database is migrated + seeded from a workstation (`pnpm prisma:deploy:prod`, `pnpm seed:prod`) —
never in the build or CI. Detailed CI/CD, domain, SEO, and seed operator steps are intentionally
kept out of this file to avoid staleness; see `agents/AGENTS.md` for durable agent/maintainer
context. Keep internal operator notes out of public README content.

## Git Workflow

Branch from `main`, never commit to `main` directly, open PRs to `main`. PR titles + commit
messages follow Conventional Commits. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Future Phases (tracked as GitHub issues)

Not built yet; good first issues to file:

1. **Score New Law** (lead premium feature) — `POST /api/score` + UI running arbitrary text
   through the four HF LocalLaws scorer models, behind a configurable `HF_INFERENCE_BASE_URL`.
   Strong fit for the first USDC-gated unlock.
2. **USDC / agentic payments** — open-core monetization gating premium capability while the core
   remains source-available under BUSL terms.

County-level view is **shipped** (camera zoom, county aggregates, sparse copy). Remaining
data-shape work (ugly slugs, gazetteer, LOCUS-v1.1) is coverage/docs — see issue #25.
Do not treat empty county outlines as a fill bug.
