# LOCUS Explorer

Explore the complete [LOCUS-v1](https://huggingface.co/LocalLaws) corpus of ~2.2M U.S. local
laws: full-text search, server-side filtering, an interactive HTML5 Canvas choropleth map, and
per-jurisdiction statistics — in a strict black-and-white interface.

Every law in LOCUS-v1 is scored along four axes:

- **Opacity** — how hard the text is to read / understand.
- **Enforcement Discretion** — latitude granted to enforcers.
- **Paternalism** — degree to which the rule restricts personal choice.
- **Problem Salience** — how pressing the underlying problem is.

## Features

- **Full-text search** over law headers and content, powered by a Postgres `tsvector` + GIN
  index and `websearch_to_tsquery`.
- **Faceted filtering**: keyword, four dual-handle score-range sliders, state, county, function,
  topic, and substantive/procedural type. Text and slider inputs are debounced.
- **Interactive map**: an HTML5 Canvas choropleth (d3-geo + us-atlas) colored by the selected
  axis; click a state to filter and open its profile.
- **Results list**: high-performance, server-side paginated results with sortable score columns
  and animated loading skeletons.
- **Law detail modal**: full text, all four scores, and function / topic / jurisdiction metadata.
- **Jurisdiction dashboard**: aggregate counts and average scores per state, plus notable laws.
- **Motion throughout** via framer-motion, with `prefers-reduced-motion` respected.

## Tech stack

- [Next.js 15](https://nextjs.org/) (App Router, React 19, TypeScript strict)
- [Prisma](https://www.prisma.io/) + [PostgreSQL](https://www.postgresql.org/)
- [styled-components](https://styled-components.com/) for all styling (SSR registry)
- [framer-motion](https://www.framer.com/motion/) for all animation
- Pure HTML5 Canvas map: [d3-geo](https://github.com/d3/d3-geo),
  [us-atlas](https://github.com/topojson/us-atlas), [topojson-client](https://github.com/topojson/topojson-client)
- Seed pipeline: [@dsnp/parquetjs](https://github.com/LedgerHQ/parquetjs) + `pg` COPY streaming
- Package manager: [pnpm](https://pnpm.io/)

## Prerequisites

- **Docker** — the only thing you need for the one-command stack below.
- Node.js >= 20 and pnpm — only if you'd rather run the app on the host.

## Quick start (one command)

With Docker running, a fresh clone becomes a full local app in one command:

```bash
docker compose up        # or: pnpm up
```

This builds the app image, starts Postgres, applies migrations, sample-seeds the database
(~25k rows) on first run, and serves the app at http://localhost:3000 with hot reload.
Re-running `docker compose up` is fast — the seed is skipped once data already exists.

## Alternative: run on the host

Prefer running Next.js on the host instead of in the container? Start only Postgres in Docker:

```bash
pnpm install              # installs deps; postinstall runs `prisma generate`
cp .env.example .env      # then adjust values if needed
pnpm db:up                # start local Postgres only (Docker, port 5432)
pnpm prisma:deploy        # apply migrations (creates tables + tsvector/GIN index)
pnpm seed --limit 25000   # fast sample seed for development
pnpm dev                  # http://localhost:3000
```

The app tolerates an empty database — panels render empty states and skeletons until data is
seeded, so you can start `pnpm dev` before seeding finishes.

## Environment variables

`docker compose up` wires these automatically — you don't set anything. They're only needed for
the host path or production, where you copy `.env.example` to `.env`:

- `DATABASE_URL` — Postgres connection string used by the app (pooled in production).
- `DIRECT_URL` — direct (non-pooled) connection string used by Prisma for migrations. Locally
  this is identical to `DATABASE_URL`.
- `SEED_LIMIT` — rows `docker compose up` sample-seeds on first boot (default 25000); set to 0
  for the full corpus (see the Seeding section).

## Seeding (getting the data)

The corpus is **not** committed to git — it's ~1.77 GB of Postgres data. A fresh clone +
`docker compose up` loads a fast **~25k-row sample** so the app is immediately usable, but the
map only shows the handful of states in that sample.

To load the **entire ~2.2M-row corpus** (every state):

```bash
# host, against the Docker Postgres:
pnpm db:up && pnpm seed

# or inside the running container:
docker compose exec app pnpm seed

# or have `docker compose up` do it on a fresh DB (set SEED_LIMIT=0, e.g. in .env):
SEED_LIMIT=0 docker compose up
```

The seeder streams the 8 parquet shards from Hugging Face, bulk-loads them via Postgres `COPY`,
records completed shards in `seed_checkpoints` for resumability, and recomputes the
`jurisdictions` aggregates (national + per-state) with the per-axis `[min, max]` bounds used for
the slider domains and map color scale. It's checkpointed, so an interrupted `pnpm seed` resumes
safely; `pnpm seed --fresh` resets and reseeds. Other flags: `--limit 25000` (sample),
`--shards 0,1` (specific shards).

## Available scripts

- `pnpm dev` — start the dev server.
- `pnpm build` / `pnpm start` — production build / serve.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm lint` — Next.js ESLint.
- `pnpm up` / `pnpm up:build` — run the full stack (Postgres + app) via Docker Compose.
- `pnpm db:up` / `pnpm db:down` — start / stop local Postgres only (Docker).
- `pnpm prisma:deploy` — apply migrations (production-safe).
- `pnpm prisma:migrate` — create/apply a dev migration.
- `pnpm seed` — run the seed pipeline (see above).

## Project structure

```text
app/                                # Next.js App Router
  api/laws/route.ts                 # GET /api/laws -> data/queries.queryLaws
  api/jurisdictions/route.ts        # GET /api/jurisdictions -> getJurisdictions
  api/jurisdictions/[state]/route.ts  # GET /api/jurisdictions/[state]
  layout.tsx, page.tsx              # root layout + single-page shell
  about/page.tsx                    # /about — local-ordinance primer + attribution
components/                         # nav, sidebar, map, results, jurisdiction, modal
lib/                                # store, theme, styled-components registry, types re-export
data/
  prisma/                           # schema.prisma + migrations (tsvector/GIN)
  queries/                          # data-access layer: laws.ts, jurisdictions.ts
  db.ts                             # Prisma client singleton
  types.ts                          # shared domain types (axes, filters, records)
  seed.ts                           # parquet -> Postgres seed pipeline
  db-count.ts                       # row-count probe for the Docker entrypoint
next.config.ts, tsconfig.json
Dockerfile, docker-compose.yml, docker/entrypoint.sh   # one-command full stack
```

## Deployment (Vercel)

The app deploys to Vercel with a managed Postgres database (Vercel Postgres or Neon).

1. Import the repository into Vercel (a standard Next.js project at the repo root — auto-detected).
2. Provision a Postgres database and map its connection strings to the app's variables:
   - `DATABASE_URL` → the **pooled** connection string (e.g. `POSTGRES_PRISMA_URL`).
   - `DIRECT_URL` → the **non-pooling** connection string (e.g. `POSTGRES_URL_NON_POOLING`).
3. Apply migrations against the production database (`pnpm prisma:deploy` with the production
   `DIRECT_URL`) and run the seed.

All API route handlers are `dynamic = "force-dynamic"`, so results always reflect the current
database.

## Attribution

LOCUS Explorer is built on the LOCUS-v1 corpus. Please cite:

```bibtex
@article{peskoff2026freeing,
  title={Freeing the Law with LOCUS: A Local Ordinance Corpus for the United States},
  author={Peskoff, Denis and Barrow, Joe and Vu, Christopher and Davenport, Diag},
  journal={arXiv preprint arXiv:2606.19334},
  year={2026}
}
```

- Paper: <https://arxiv.org/abs/2606.19334>
- Models & dataset: <https://huggingface.co/LocalLaws>

## Contributing & license

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow. Licensed under
[MIT](./LICENSE).
