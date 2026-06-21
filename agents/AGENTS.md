# AGENTS.md

Durable context for agents working in `visualize-laws-app`.

## Scope

This file is intentionally development-focused. Deployment, CI/CD, DNS, and SEO execution runbooks are intentionally excluded to avoid staleness; use plan `cec5df35-4596-4df4-bc1c-7b470b069bba` when those details are needed.

## Project snapshot

- Single Next.js App Router app at the repository root.
- Data layer lives in `data/` (Prisma schema/migrations, DB client, seed pipeline, query functions).
- API routes in `app/api/*` are the backend and delegate to `data/queries/*`.
- Styling uses styled-components with strict black/white theme tokens.

## Important paths

- `app/layout.tsx`, `app/page.tsx`, `app/api/*` — UI shell and HTTP endpoints.
- `components/` — map, sidebar, results, jurisdiction, modal UI.
- `lib/store.tsx`, `lib/theme.ts`, `lib/registry.tsx` — app state, theme tokens, SSR wiring.
- `data/prisma/schema.prisma` + `data/prisma/migrations/` — database schema and SQL migrations.
- `data/db.ts` — Prisma client singleton.
- `data/queries/laws.ts` and `data/queries/jurisdictions.ts` — data-access logic.
- `data/seed.ts` — parquet → Postgres ingest with checkpoints.

## Local development commands

- `pnpm install`
- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm up` / `pnpm up:build` / `pnpm up:full`
- `pnpm db:up` / `pnpm db:down` / `pnpm db:studio`
- `pnpm prisma:deploy` / `pnpm prisma:migrate`
- `pnpm seed` / `pnpm seed --limit 25000` / `pnpm seed --fresh`

## Data and querying notes

- State codes are lowercase two-letter codes in data/UI.
- Full-text search is Postgres `tsvector` + GIN index.
- `data/queries/laws.ts` uses parameterized SQL; only whitelisted sort fields are interpolated.
- Seed is resumable through `SeedCheckpoint`; aggregate rows are recomputed into `Jurisdiction`.

## Working conventions

- Keep changes scoped and logically grouped.
- Do not commit directly to `main`; follow `CONTRIBUTING.md`.
- Prefer `pnpm` (no corepack).
