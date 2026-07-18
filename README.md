# visualizelaws.com

**Live at [visualizelaws.com](https://visualizelaws.com).**

Explore the complete [LOCUS-v1](https://huggingface.co/LocalLaws) corpus of ~2.2M U.S. local laws:
full-text search, server-side filtering, an interactive HTML5 Canvas choropleth map, and
per-jurisdiction statistics — in a strict black-and-white interface.

Every law is scored on four axes: **Opacity** (how hard the text is to read), **Enforcement
Discretion** (latitude granted to enforcers), **Paternalism** (how much it restricts personal
choice), and **Problem Salience** (how pressing the underlying problem is).

## Features

- **Full-text search** over headers and content via Postgres `tsvector` + GIN and
  `websearch_to_tsquery`.
- **Faceted filtering**: keyword, four score-range sliders, state, county, function, topic, and
  substantive/procedural type (text + slider inputs debounced).
- **Interactive map**: HTML5 Canvas choropleth (d3-geo + us-atlas) colored by the selected axis;
  click a state to filter and open its profile.
- **Results + law detail**: server-side paginated list with sortable scores; the modal fetches the
  full law text on demand from `GET /api/laws/[id]`.
- **Jurisdiction dashboard**: per-state aggregate counts and average scores, plus notable laws. The
  jurisdiction APIs are cached for one hour, so allow up to an hour for reseeded aggregates to
  appear.
- **Motion throughout** via framer-motion, honoring `prefers-reduced-motion`.

## Tech stack

Next.js 15 (App Router, React 19, TypeScript strict) · Prisma + PostgreSQL · styled-components
(SSR registry) · framer-motion · pure HTML5 Canvas map (d3-geo, us-atlas, topojson-client) · seed
via `@dsnp/parquetjs` + `pg` COPY streaming · pnpm.

## Quick start (one command)

With Docker running, a fresh clone becomes a full local app:

```bash
docker compose up    # or: pnpm up    — 25k-row sample on first run
pnpm up:full         # SEED_LIMIT=0 — load the ENTIRE ~2.2M-row corpus
```

This starts Postgres 18 (`pgvector/pgvector:pg18`; pgvector available but dormant) + the app,
applies migrations, seeds on first run (skipped once data exists), and serves
http://localhost:3000 with hot reload.

> Moved or renamed the folder? The app container's `/workspace` bind mount (an absolute host path
> captured at create time) goes stale and the entrypoint exits with a FATAL message. Recreate with
> `docker compose up -d --force-recreate` — data is preserved in the named volume.

## Run on the host instead

Start only Postgres in Docker and run Next.js locally:

```bash
pnpm install            # postinstall runs `prisma generate`
cp .env.example .env.local
pnpm db:up              # local Postgres only (port 5432)
pnpm prisma:deploy      # tables + tsvector/GIN index
pnpm seed --limit 25000 # fast sample
pnpm dev                # http://localhost:3000
```

The app tolerates an empty DB (empty states + skeletons), so you can `pnpm dev` before seeding
finishes.

## Environment variables

`docker compose up` wires these automatically; you only set them for host/production —
copy `.env.example` to `.env.local` (and add a `.env.prod` for remote admin tasks):

- `DATABASE_URL` — app connection (pooled in production).
- `DIRECT_URL` — direct/non-pooled connection for Prisma migrations (same as `DATABASE_URL`
  locally).
- `SEED_LIMIT` — rows `docker compose up` sample-seeds on first boot (default 25000; `0` = full
  corpus).

## Seeding

The ~1.77 GB corpus is **not** in git. A fresh `docker compose up` loads a ~25k-row sample; to load
the full ~2.2M-row corpus (every state):

```bash
pnpm db:up && pnpm seed              # host, against Docker Postgres
docker compose exec app pnpm seed    # or inside the container
pnpm up:full                         # or full corpus on first boot
```

The seeder streams the 8 parquet shards from Hugging Face, bulk-loads via `COPY`, checkpoints each
shard in `seed_checkpoints` (resumable), and recomputes the `jurisdictions` aggregates. Flags:
`--fresh` (reset + reseed), `--limit N` (sample), `--shards 0,1`.

Browse the DB with `pnpm db:studio` (Prisma Studio at http://localhost:5555). The generated
`search_vector` column is hidden as an `Unsupported(...)` type — expected, and search is unaffected.

## Scripts

`pnpm dev` · `pnpm build` / `pnpm start` · `pnpm lint` · `pnpm typecheck` · `pnpm up` /
`pnpm up:build` / `pnpm up:full` · `pnpm db:up` / `pnpm db:down` / `pnpm db:studio` ·
`pnpm prisma:deploy` / `pnpm prisma:migrate` · `pnpm seed`.

## Project structure

```text
app/
  api/laws/route.ts                   # GET /api/laws        -> queryLaws (summaries)
  api/laws/[id]/route.ts              # GET /api/laws/[id]   -> getLawById (full detail)
  api/jurisdictions/route.ts          # GET /api/jurisdictions (cached 1h) -> getJurisdictions
  api/jurisdictions/[state]/route.ts  # GET /api/jurisdictions/[state]     -> getJurisdictionDetail
  layout.tsx, page.tsx, about/        # root layout, single-page shell, /about
components/                           # nav, sidebar, map, results, jurisdiction, modal
lib/                                  # store, theme, styled-components registry, types re-export
data/
  prisma/                             # schema.prisma + migrations (tsvector/GIN)
  queries/                            # data-access: laws.ts, jurisdictions.ts
  db.ts, types.ts, seed.ts, db-count.ts
next.config.ts, tsconfig.json, Dockerfile, docker-compose.yml, docker/entrypoint.sh
```

## Attribution

Built on the LOCUS-v1 corpus.

```bibtex
@article{peskoff2026freeing,
  title={Freeing the Law with LOCUS: A Local Ordinance Corpus for the United States},
  author={Peskoff, Denis and Barrow, Joe and Vu, Christopher and Davenport, Diag},
  journal={arXiv preprint arXiv:2606.19334},
  year={2026}
}
```

Paper: <https://arxiv.org/abs/2606.19334> · Models & dataset: <https://huggingface.co/LocalLaws>

## Production

Deployed on [Vercel](https://vercel.com) at [visualizelaws.com](https://visualizelaws.com): the
Next.js app + `/api/*` route handlers, **Prisma Postgres** for the database, and **Cloudflare** DNS.
The production database is migrated + seeded from a workstation (`pnpm prisma:deploy:prod`,
`pnpm seed:prod`) — never in the build or CI. See `.env.example` for the `.env.local` (local) vs
`.env.prod` (remote admin) convention.

## Contributing & license

See [CONTRIBUTING.md](./CONTRIBUTING.md). Licensed under Business Source License 1.1 (BUSL-1.1);
see [LICENSE](./LICENSE).
