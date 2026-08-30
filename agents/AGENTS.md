# AGENTS.md

Durable context for agents working in `visualize-laws-app`.

## Scope

This file is **agent/maintainer-facing** (not end-user product docs). Prefer putting
operator runbooks, timing expectations, and remote-DB notes here or in `WARP.md`.
Keep `README.md` public/fork-friendly: high-level features + generic local quick start
only — **do not** document maintainer-only remote DB ops, credentials layout, or
internal agent workflow in GitHub-facing README content.

Deployment, CI/CD, DNS, and SEO execution runbooks are intentionally thin here to
avoid staleness; expand only when durable.

## Project snapshot

- Single Next.js App Router app at the repository root.
- Data layer lives in `data/` (Prisma schema/migrations, DB client, seed pipeline, query functions).
- API routes in `app/api/*` are the backend and delegate to `data/queries/*`.
- Styling uses styled-components with strict black/white theme tokens.
- City/county map is **shipped**: camera zoom over a baked Albers USA mesh.
  Native county aggregates (~376) plus one-county city stand-ins (`county_fills`).
  Sparse-county copy when n < 8 (native + stand-ins). Multi-county cities stay
  unpainted (issue #25).

## Important paths

- `app/layout.tsx`, `app/page.tsx`, `app/api/*` — UI shell and HTTP endpoints.
- `components/` — map, sidebar, results, jurisdiction, modal UI.
- `components/map/` — canvas choropleth: `MapPanel.tsx`, `geo.ts`, `camera.ts`,
  `sparseCounties.ts`, `counties.ts`, `fips.ts`.
- `lib/store.tsx`, `lib/theme.ts`, `lib/registry.tsx` — app state, theme tokens, SSR wiring.
- `data/prisma/schema.prisma` + `data/prisma/migrations/` — database schema and SQL migrations
  (incl. generated `search_vector` + city/county trigram indexes).
- `data/db.ts` — Prisma client singleton.
- `data/queries/laws.ts` and `data/queries/jurisdictions.ts` — data-access logic
  (`resolvePlace` lives in jurisdictions).
- `data/slugs.ts` — place slug variants / atlas join keys. Do not rewrite stored slugs.
- `data/seed.ts` — parquet → Postgres ingest with checkpoints + stall recovery.
- `data/cityCounty.ts` + `data/build-city-county.ts` — Census 2020 place join and
  `city_county` / `county_fills` rebuild (no parquet COPY).
- `data/fines.ts` + `data/build-fines.ts` — LOCUS-Fines identity key / COPY encoding and
  the `law_fines` rebuild. Uses `hyparquet`, not `@dsnp/parquetjs` (see the fines runbook).
- `WARP.md` — Warp project rules (loaded automatically in this repo).

## Local development commands

- `pnpm install` (prefer pnpm; **no corepack**)
- `pnpm dev` / `pnpm build` / `pnpm lint` (`eslint .`) / `pnpm typecheck` / `pnpm test`
- `pnpm up` / `pnpm up:build` / `pnpm up:full`
- `pnpm db:up` / `pnpm db:down` / `pnpm db:studio`
- `pnpm prisma:deploy` / `pnpm prisma:migrate`
- `pnpm seed` / `pnpm seed --limit 25000` / `pnpm seed --fresh`
- `pnpm seed --fresh --shards 1 --limit 25000` — Colorado city/county QA sample
- `pnpm seed --shards ''` — recompute national/state/county aggregates, then city fills
- `pnpm build:city-county` — rebuild `city_county` + `county_fills` only (no COPY)
- `pnpm build:fines` — rebuild `law_fines` only; `--restage` discards a partial staging
  table instead of resuming it
- Remote admin (gitignored env): `pnpm seed:prod` / `pnpm seed:prod --fresh` /
  `pnpm prisma:deploy:prod` / `pnpm db:studio:prod` / `pnpm build:fines:prod`

## Env files (agents)

- `.env.local` — local Next + host scripts (`pnpm seed`, `pnpm prisma:deploy`).
- `.env.prod` — remote admin only (`pnpm seed:prod`, migrate/studio against prod).
  Never print, commit, or paste `DATABASE_URL` / `DIRECT_URL` values.
- `.env.example` — tracked template only.

## Data and querying notes

- State codes are lowercase two-letter codes in data/UI.
- Full-text search is Postgres `tsvector` + GIN index (`search_vector` is GENERATED).
- `data/queries/laws.ts` uses parameterized SQL; only whitelisted sort fields are interpolated.
  Place search boosts city/county slug hits with `IS TRUE` (nullable `OR` is NULL and
  sorts first under `DESC`).
- `/api/laws` returns law summaries; `/api/laws/[id]` (`getLawById`) returns the full law on demand.
- `GET /api/jurisdictions` (US rows, no query) may use a short CDN cache (`s-maxage=60`,
  SWR 300) when `national` and `rows` are present. Do not cache `national: null` / empty
  rows. `?city=` / `?county=` lookup and `/api/jurisdictions/[state]` stay `no-store` /
  `force-dynamic`. Do not reintroduce `force-static` or hour-long cache on these routes.
- `GET /api/jurisdictions` without params is the US map payload (state + national only).
  `?city=` / `?county=` is `resolvePlace` (`{ places }`) and must not grow that payload
  or spawn a new REST tree.
- Loading ≠ sparse. US wait: `Loading the map.` State wait (atlas or county rows):
  `Loading counties in {State}.` Sparse copy only after the request has settled.
- City and county slugs are mutually exclusive on a law row (LOCUS-v1). County
  `Jurisdiction` rows (~376 on a full seed) are paints only; they are not the mesh.
- `law_fines` holds only the **632,005 model-read** LOCUS-Fines rows. An absent row means
  the supplement never sent that law to its model — it does **not** mean the law has no
  penalty. Never render a missing row as “no fine.”
- Penalty filters (`hasFine`, `jail`, `perDay`, `fineMin`, `fineMax`, `penaltyNature`) narrow
  to that subset, so they must keep disabling the saved-total shortcut in
  `shouldUseSavedScopeTotal`. `penaltyNature` is whitelisted before it reaches SQL.
- Seed is resumable; see **Seeding runbook** below.

## City / county map (invariants)

- Mesh is baked once into a fixed 960×600 Albers USA world. Zoom tweens a camera
  `{k, tx, ty}` and `setTransform`s. **Do not** `fitExtent` or `new Path2D` on select,
  incoming scores, zoom, or resize. Cities have no polygons and no geocoding.
- Search / sidebar place pick zooms to the **state** and outlines the county. Do not
  invent a tighter city zoom. Prefer a **city** hit unless the query says
  county/parish/borough. Wait for submit or ≥3 chars / unique hit; clearing the
  City/County chip must not zoom out. Only ocean / Clear zooms out.
- Sparse gate **K=8** (`sparseCounties.ts`): n < 8 → outlines + copy, no county
  legend, no fills; scored counties stay clickable. n ≥ 8 → fill scored/joined
  counties only (native + one-county city stand-ins). Unscored hover is
  `{Name} · no data`. A city stand-in hover is `{County} · {City} code` — not
  “county law.” Clicking an unfilled county is a no-op. Never special-case a
  state. Never interpolate scores or paint a multi-county city.
- Empty outlines remain for unmatched places and multi-county cities
  (Houston, Dallas, Chicago, NYC, Columbus, Atlanta, Aurora). ~3,231 atlas
  shapes vs native ~376 plus one-county city fills. Joe Barrow / LOCUS paper
  grammar: a representative local code, not controlling authority.
- Do **not** rewrite `laws.city` / `laws.county` in place to Census names
  (breaks LOCUS-v1 re-seed and additive shards). Pretty-print / gazetteer only.
  `city_county` is the additive lookup.
- Zoom-out must drop the county mesh immediately (`focusStateRef` cleared at the
  start of the US tween) so outlines do not linger.

## Penalties map layer (invariants)

- It is a **layer, not a fifth axis**: `layer: "scores" | "penalties"` in `lib/store.tsx`,
  separate from `axis`, and selecting any axis returns to `scores`. Do not add a fines entry
  to `Axis` / `AXES` / `AxisAverages` — those are z-scored per-law averages with slider
  semantics that a share does not have.
- Colour is **`amount_sections / penalty_sections`**, derived via `amountShare()`, never
  stored. Denominator is model-read sections; dividing by all laws correlates with sampling
  (r = 0.46) instead of with the codes (r = 0.11).
- **Never paint median fine.** 32 of 50 states are exactly $500. It is shown as a number in
  the legend strip and hover only. It is genuinely informative at county level, which is why
  the hover carries it.
- No annotation → no fill and `not annotated` on hover. Never `no penalty`.
- The legend stat cards must stay mounted outside the `sparseCounties` early return in
  `components/map/Legend.tsx`, or the eight thin states lose their figures.
- `place_penalties` is rebuilt only by `pnpm build:fines`. Running `pnpm build:city-county`
  afterwards is safe — that was the reason for a sibling table rather than columns on
  `jurisdictions` / `county_fills`.

## Working conventions

- Keep changes scoped and logically grouped (atomic commits).
- Do not commit directly to `main`; branch + PR; Conventional Commits. See `CONTRIBUTING.md`.
- Prefer `pnpm` (no corepack).
- Supported Next line is **16.x**. Keep `next` and `eslint-config-next` in lockstep. Do not
  merge Dependabot semver-major PRs for Next, ESLint, TypeScript, or `@types/node`.
- `pnpm.overrides` exist only for transitives parents have not patched (Nano ID, js-yaml,
  brace-expansion). Drop an override when the parent tree is already safe. Do not force
  `deepmerge-ts@8` through Prisma — dismiss/revisit Dependabot #27 until Prisma ships a fix.
- Do not run the app/deploy unless the task asks for it.
- Never stage `.env*`, credentials, or parquet cache (`.locus-cache/`).
- Prisma **drops/resets** a shadow database. Never pass a URL that has data
  (local Docker or remote) as `--shadow-database-url`. Never `migrate reset`
  or `db push` against a database you care about.
- Apply committed SQL with `pnpm prisma:deploy` / `prisma:deploy:prod` only.
  `pnpm prisma:migrate` (`migrate dev`) is only for **authoring** a new
  migration, and only against local Docker. Do not use it to “fix”
  `search_vector` drift (`DROP DEFAULT` breaks FTS).
- `--fresh` truncates `laws`. Never on production unless explicitly asked.

## PR review (Grok in-session)

No Cursor Bugbot / Grok GitHub review app (pay-per-use). Reviews are
`/review --pr N` in a Grok session.

- Reviews are short: bugs and the ask only. No play-by-play. Do not post a GitHub comment as the repo owner unless asked — keep the review in-session unless asked to post.
- PRs by the repo owner and `dependabot[bot]` only, unless asked.
- Load this file, `WARP.md`, and issue #25 before judging map / data / migrate diffs.
- Dependabot: version/compat and whether the bump touches migrate/seed/shadow — no drive-by refactors.
  Security updates may be grouped; Next/ESLint/TypeScript majors are out of band.

---

## Seeding runbook (agents)

Canonical seeder: `data/seed.ts`. Scripts:

| Command | Target |
| --- | --- |
| `pnpm seed …` | `.env.local` (local Docker/host Postgres) |
| `pnpm seed:prod …` | `.env.prod` (remote Prisma Postgres DIRECT) |

Flags: `--fresh` (TRUNCATE laws + **law_fines** + jurisdictions + seed_checkpoints +
city_county + county_fills + clear local progress), `--limit N` (sample; leaves shard
un-checkpointed), `--shards 0,1`, `--shards ''` (no COPY — recompute
national/state/**county** aggregates, then city fills).

`law_fines` is in the `--fresh` truncate list because it holds an FK to `laws`; leaving
it out makes Postgres reject the whole TRUNCATE.

Default `--limit 25000` is Alaska-only (shard 0). City/county QA needs Colorado:

`pnpm seed --fresh --shards 1 --limit 25000`

Existing DBs that already have `laws` rows skip docker seed. After the city-index
migration they still need `pnpm seed --shards ''` (or `pnpm seed:prod --shards ''`)
or the county choropleth stays empty. See **Working conventions** for
migrate/shadow rules (`deploy` vs `dev`, never shadow a database with data).

### What the seeder does

1. Streams 8 LOCUS-v1 parquet shards (Hugging Face); caches under `.locus-cache/` (~1.77 GB total).
2. Bulk-loads via Postgres `COPY` in **5k-row batches**, **commit per batch**.
3. Local mid-shard progress: `.locus-cache/seed-progress.json` (skip already-committed rows on retry).
4. Whole-shard resume: `seed_checkpoints` (one row per finished shard `0000`…`0007`).
5. Recomputes `jurisdictions` (1× `national` + 1× `state` per distinct non-empty
   state code + 1× `county` per `(state, county)` with a non-empty county slug).
6. Rebuilds `city_county` + `county_fills` from `laws` + Census 2020 place/county
   files (`pnpm build:city-county` does this without parquet COPY).
7. Rebuilds `law_fines` from the LOCUS-Fines supplement (`pnpm build:fines` standalone).
   Non-fatal: a failure warns and the seed still finishes.
8. `search_vector` is GENERATED — never written by the seeder.

### Resilience (remote-aware)

Managed Postgres (Prisma) can **silently stall** mid-COPY with no error. The seeder:

- Sets a short load-phase `statement_timeout` (~45s) and a client COPY watchdog (~90s) that
  destroys the socket on hang.
- Retries the current shard up to 8 times with reconnect/backoff.
- **Must** attach a `pg` Client `error` listener so socket destroy does not crash Node before retry.
- Disables/long-timeouts for TRUNCATE and `computeAggregates` (full-table scans over 2.2M rows).

Always ensure a **single writer**:

```bash
pkill -9 -f 'data/seed.ts' 2>/dev/null || true
pgrep -fl 'data/seed.ts' || echo 'no seed'
```

### How to run (agent pattern)

1. Confirm no orphan seeders (above).
2. Prefer background + log so the session stays usable:

```bash
mkdir -p /tmp/viz-seed
nohup pnpm seed:prod --fresh </dev/null >/tmp/viz-seed/seed-prod.log 2>&1 &
echo $! > /tmp/viz-seed/seed.pid
# monitor: tail -f /tmp/viz-seed/seed-prod.log
# resume after stall (do NOT --fresh unless intentional wipe):
# nohup pnpm seed:prod </dev/null >/tmp/viz-seed/seed-prod.log 2>&1 &
```

3. If editing `data/seed.ts`, run `pnpm typecheck`, branch off `main`, PR only the seeder/docs change.
4. Do **not** re-run migrations on prod unless schema work is in scope (tables/indexes are durable).

### Expected duration (realistic)

Parquet must be cached or downloaded once (~1.77 GB). Times below assume a modern laptop and
cached shards; first download adds wall clock.

| Scenario | What | Realistic wall clock |
| --- | --- | --- |
| **Local sample** | `pnpm seed --limit 25000` or `pnpm up` default | **~1–5 min** |
| **Local full corpus** | `pnpm seed` / `pnpm up:full` → Docker Postgres on localhost | **~15–40 min** once cached (often multi‑k rows/s; no WAN DB RTT) |
| **Remote full fresh** | `pnpm seed:prod --fresh` → Prisma Postgres (`db.prisma.io`) from laptop | **~30–60+ min** typical; sustained ~0.8–3k rows/s with occasional silent stalls |
| **Remote resume** | `pnpm seed:prod` after checkpoints/progress exist | **minutes to tens of minutes** depending on remaining rows + retries |
| **Aggregates only** | after all laws loaded | **a few minutes** on remote; faster locally |

Notes:

- Remote is dominated by **network RTT + managed DB COPY behavior**, not CPU. Stalls are normal;
  success means retries resume and finish, not a perfect stall-free log.
- A clean remote run that hit ~1.9M then stalled early on the last shard still finished after
  resume; plan for **watchdog timeouts + reconnect**, not a single uninterrupted process.
- Local full load is the right default for day-to-day dev. Remote full seed is **maintainer-only**
  (effectively one operator) and should be delegated to a long-running agent/session so the main
  chat stays free.

### Fines layer runbook (`law_fines`)

Separate builder: `data/build-fines.ts` (`pnpm build:fines` / `pnpm build:fines:prod`).
Also runs at the end of `pnpm seed`, non-fatally.

- **Different parquet reader, on purpose.** LOCUS-Fines is one ~87 MB file with
  **1,048,576-row row groups**; the LOCUS-v1 shards use ~56k. `@dsnp/parquetjs`
  materializes an entire row group, so it OOMs at the default heap here and needs
  ~7.75 GB RSS to finish. The builder uses `hyparquet` with bounded 50k-row ranges and
  peaks near 1.2 GB. Do not “unify” the two readers.
- **Only model-read rows are stored** (`annotation_source = 'LLM'`): 632,005 of the
  2,211,516 published rows. The other 1,579,511 are rule-derived from LOCUS fields and
  carry no amounts.
- **The join key is not unique.** The supplement's seven identity columns repeat across
  2,411 groups / 5,200 rows of LOCUS-v1, so staging is deduped with `DISTINCT ON` before
  the join; the join then re-expands one annotation across each identical law row.
- **Resumable.** Staging (`law_fines_import`, unlogged) survives a crash and a rerun
  resumes from its row count. `pnpm build:fines --restage` discards it instead. Staging
  is dropped on success. The final attach is one transaction, so readers keep seeing the
  previous `law_fines` until it commits.
- **Timings** (full corpus, parquet cached): local Docker **~40 s** end to end. Remote is
  dominated by the COPY of 632k narrow rows over the WAN plus one server-side hash join;
  budget **~10–30 min** and expect the same stall/reconnect behaviour as the corpus seed.
- Run remote builds background + logged, single writer, exactly like `seed:prod`
  (`pkill -9 -f 'data/build-fines.ts'` to check for orphans).

### Verification (after any full seed)

Expect:

- `laws` count **≈ 2,211,516** (exact corpus size)
- `seed_checkpoints` **= 8**
- `jurisdictions`: **1** `national` + **one `state` row per distinct non-empty state**
  (50 in current corpus) + ~**376** `county` rows
- `national.law_count` should match `count(*)` on `laws`
- `law_fines` **= 632,005**, of which **83,625** have a non-null `effective_max`;
  `count(distinct law_id)` must equal the row count. Other exact expectations:
  `fine_relevant` 324,516 · `penalty_stated = 'amounts_here'` 100,488 ·
  `per_day_violation` 44,797 · `jail_mentioned` 35,635 · `grounded IS false` 465 ·
  non-null `extraction_flag` 15,897. These are the supplement's own counts, so any
  drift means the join lost or duplicated rows.
- Existing DBs that already have `laws` but no county aggregates (skipped docker
  seed after the city-index migration) need `pnpm seed --shards ''` — indexes
  alone will not fill the choropleth
- Existing DBs predating the fines migration need `pnpm prisma:deploy` then
  `pnpm build:fines`

Read-only check pattern (never echo connection strings):

```bash
pnpm exec dotenv -e .env.prod -- node --input-type=module -e '
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
await c.connect();
const q = async (sql) => (await c.query(sql)).rows;
console.log({
  laws: (await q("select count(*)::bigint n from laws"))[0].n,
  checkpoints: (await q("select count(*)::int n from seed_checkpoints"))[0].n,
  juris: await q("select level, count(*)::int n from jurisdictions group by level order by level"),
});
await c.end();
'
```

For local, use `.env.local` the same way (or `pnpm db:studio`).

### Agent behavior for long seeds

- Own the job end-to-end: single writer → run → monitor → retry/resume → verify counts.
- Send short progress updates (shard complete / stall+retry / final counts); do not block the
  user on interactive confirmation for each batch.
- On storage/quota or unrecoverable remote errors, stop and report immediately.
- Prefer a dedicated child/background agent for full remote loads so the primary session stays free.

## Doc surface guide

| Surface | Audience | Put here |
| --- | --- | --- |
| `README.md` | Public / forks | Product pitch, generic local quick start, license |
| `WARP.md` | Warp agents in-repo | Architecture, commands, seed summary + gotchas |
| `agents/AGENTS.md` | Agents + maintainer | Runbooks, timings, remote ops, conventions |
| Warp **Global Rules** | All Warp sessions | Cross-repo prefs (pnpm, no secrets in logs, long jobs in background) |
