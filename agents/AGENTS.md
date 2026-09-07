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
- Styling uses styled-components: black/white foundation, axis accents, green fines,
  red branding and HSL map ramps. National bounds drive sliders; visible fill-row
  min/max drives each map domain.
- `/about` and `/log` are separate pages; releases live in `lib/releases.ts`.
  Funny mode uses `lib/copy.ts`. `JurisdictionsProvider` owns shared requests and
  `lib/useCachedFetch.ts` keeps responses keyed to their resource.
- City/county map is **shipped**: camera zoom over a baked Albers USA mesh.
  Native county aggregates (~376) plus one-county city stand-ins (`county_fills`).
  Sparse-county copy when n < 8 (native + stand-ins). Multi-county cities stay
  unpainted (issue #25).

## Important paths

- `app/layout.tsx`, `app/page.tsx`, `app/api/*` — UI shell and HTTP endpoints.
- `components/` — map, sidebar, results, jurisdiction, modal UI.
- `components/map/` — canvas choropleth: `MapViewProvider.tsx` (fillRows/domain/sparse/bake),
  `MapPanel.tsx` (camera + Path2D draw), `MapChrome.tsx`, `geo.ts`, `camera.ts`,
  `sparseCounties.ts`, `counties.ts`, `fips.ts`. Do not put camera state in `lib/store.tsx`.
- `lib/store.tsx`, `lib/theme.ts`, `lib/registry.tsx` — app state (`selectFocus` / `PlaceFocus`),
  theme tokens, SSR wiring. Compact layout: `lib/useCompactLayout.ts`.
- `data/prisma/schema.prisma` + `data/prisma/migrations/` — database schema and SQL migrations
  (incl. generated `search_vector` + city/county trigram indexes).
- `data/db.ts` — Prisma client singleton.
- `data/queries/laws.ts` and `data/queries/jurisdictions.ts` — data-access logic.
  `queryLaws(LawFilters)` / `getLawById` in laws; serialize/parse in `data/filters.ts`.
  `resolvePlace` lives in jurisdictions and is served by `GET /api/places`.
  Prisma access stays in `data/db.ts` + `data/queries/*`. Prisma is **6.x** (PG18).
  Prisma 6→7 is tracked in #45; do not import `@prisma/client` from routes.
- `data/slugs.ts` — place slug variants / atlas join keys. Do not rewrite stored slugs.
- `data/seed.ts` — parquet → Postgres ingest with checkpoints + stall recovery.
- `data/importProgress.ts` — shared writer lock, fingerprints and transactional progress;
  `tests/integration/importProgress.integration.test.ts` — isolated PG18 recovery fixtures.
- `data/cityCounty.ts` + `data/build-city-county.ts` — Census 2020 place join and
  `city_county` / `county_fills` rebuild (no parquet COPY).
- `data/fines.ts` + `data/build-fines.ts` — LOCUS-Fines identity key / COPY encoding and
  the `law_fines` / `place_penalties` rebuild. Uses `hyparquet`, not `@dsnp/parquetjs`.
- `WARP.md` — project architecture, commands and gotchas.
- `CONTRIBUTING.md` — contribution and Git workflow.

## Docker is the dev environment (read before changing anything)

This project runs in Docker. **The container does not rebuild itself, and it does not pick up
every change.** Assuming it does is how you "fix" something and see no effect.

What is live vs. baked:

- **Bind-mounted, hot-reloads**: the repo at `/workspace`. App/`data/` TypeScript edits apply
  immediately.
- **Separate output volumes**: `visualize_laws_next_dev` at `/workspace/.next-dev` and
  `visualize_laws_next` at `/workspace/.next`. Host production builds cannot overwrite
  container dev output. Private env files and generated artifacts are excluded from builds.
- **Startup counts fail closed**: a failed or nonnumeric law count exits before seed or
  server startup. Only a successful zero triggers first-run seeding.
- **Baked into the image**: `Dockerfile` and `docker/entrypoint.sh` (they are `COPY`ed to
  `/usr/local/bin/entrypoint.sh`). Host edits do nothing until `pnpm up:build`
  (`docker compose up --build`). If you change the entrypoint, you **must** rebuild or your
  change is a silent no-op.
- **Named volume `visualize_laws_node_modules`**, mounted over `/workspace/node_modules`.
  Docker fills a named volume only at first creation, so it shadows the image's copy from then
  on. **`--build` does not install a newly added dependency.** Use
  `docker compose exec app pnpm install`.
- **The generated Prisma client lives in that volume**, so it is stale after any
  `schema.prisma` change. A stale client has no delegate for the new model:
  `prisma.<newModel>` is `undefined`, and property access on it throws *synchronously* —
  which is enough to take down an entire route, not just the new feature. The entrypoint runs
  `pnpm prisma:generate` before `prisma:deploy` so a rebuilt container self-heals; otherwise
  `docker compose exec app pnpm prisma:generate`.

After pulling a branch that touches schema, deps, or the entrypoint:

```bash
pnpm up:build                              # picks up Dockerfile / entrypoint changes
docker compose exec app pnpm install       # picks up new deps into the volume
docker compose exec app pnpm prisma:generate
```

**Never `docker compose down -v`.** It destroys `visualize_laws_pgdata` along with everything
else — that is the seeded ~2.2M-row corpus, and reseeding it is a 15-40 minute job. To refresh
deps, remove just that one volume
(`docker volume rm visualize-laws-app_visualize_laws_node_modules`) or run `pnpm install`
inside the container.

## Local backup, restore verification and rebuild

Use this sequence before migrating or refreshing a populated local database. No production
access or corpus reset is implied. Keep the original database volume and parquet cache.

1. Stop only the app; start only Postgres. Confirm the intended database, mounted original
   volume, PG version, no competing seed/build writers, and free space on **both** the host
   and Docker VM. A full restore needs another database-sized allocation plus index/WAL
   headroom, not merely the compressed archive size.
2. Use repo-root `dev/`, **not system `/dev`**. It is excluded in `.gitignore` and
   `.dockerignore`; verify those exclusions before writing. Restrict the directory to 0700
   and use `umask 0077` for dumps, manifests and logs. Never put connection secrets in them.
3. Record law count/ID bounds, checkpoint records, derived counts and applied migrations.
   Use the running PG18 container's `pg_dump -Fc` for the complete database, writing
   `dev/locus-local-<UTC timestamp>.dump.partial` without overwriting an existing file.
   Finalize as `.dump` only after successful exit and `pg_restore --list`; save a SHA256.
4. **Restore-test before changing the original.** Use the same PG image in a uniquely named
   temporary container with a new dedicated volume at `/var/lib/postgresql`, `--network none`,
   no published ports and a read-only archive mount. Never attach the original volume.
   Restore with `pg_restore --exit-on-error` into an empty database; compare all captured
   baseline fields and migration state. Archive listing alone is not verification.
   Retain the archive; remove only the explicitly identified temporary container/volume.
5. Build the app image, then refresh the existing dependency volume **before normal startup**:
   `docker compose run --rm --no-deps --entrypoint pnpm app install --frozen-lockfile`.
   Confirm both database URL targets without printing credentials and review pending migrations.
   Recreate only the app; verify Prisma generation/migration, populated-DB seed skip,
   baked entrypoint and distinct `.next`/`.next-dev` mounts.
6. If derived refresh is needed, run the sole writer
   `docker compose exec -T app pnpm seed --shards ''`. This skips corpus COPY but rebuilds
   jurisdictions, city joins/fills, fines and penalties. Treat optional-builder warnings
   as failed verification even if the process exits zero. Stop for lost/legacy staging
   or source mismatches; `--restage` requires an explicit decision.
7. Compare laws/checkpoints before and after, validate derived aggregates against SQL,
   and check staging/progress cleanup and released writer lock. Exercise live API/UI behavior
   and hot reload separately from mocked tests. Never automatically restore over the original,
   run `--fresh`, or delete Compose volumes to resolve a verification failure.

Measured full-corpus local baseline: ~7.5 GB database, ~1.14 GB custom archive, ~5 minutes
for an isolated restore and ~47 seconds for a cached derived refresh. These are capacity/
timing examples, not guarantees; preserve enough Docker free space throughout the restore.

## Local development commands

- `pnpm install` (prefer pnpm; **no corepack**)
- `pnpm dev` / `pnpm build` / `pnpm lint` (`eslint .`) / `pnpm typecheck` / `pnpm test`
- `pnpm up` / `pnpm up:build` / `pnpm up:full`
- `pnpm db:up` / `pnpm db:down` / `pnpm db:studio`
  (`db:up` starts Postgres only; `db:down` stops the entire stack, preserving volumes)
- `pnpm prisma:deploy` / `pnpm prisma:migrate`
- `pnpm seed` / `pnpm seed --limit 25000` / `pnpm seed --fresh`
- `pnpm seed --fresh --shards 1 --limit 25000` — Colorado city/county QA sample
- `pnpm seed --shards ''` — recompute aggregates, city fills and fines/place penalties
- `pnpm build:city-county` — rebuild `city_county` + `county_fills` only (no COPY)
- `pnpm build:fines` — rebuild `law_fines` + `place_penalties`; `--restage` discards a partial staging
  table instead of resuming it
- Remote admin (gitignored env; only when requested): `pnpm seed:prod` /
  `pnpm prisma:deploy:prod` / `pnpm db:studio:prod` / `pnpm build:fines:prod`

### Validation
All tests live under `tests/`: unit tests mirror source paths in `tests/unit/`,
database fixtures live in `tests/integration/`, and Playwright specs in `tests/browser/`.
Node suites discover `**/*.test.ts` within their directory; Playwright discovers
`**/*.spec.ts` only in `tests/browser/`. Keep new tests out of production source directories.

- `pnpm test`: pure/domain tests, mocked core-versus-optional queries, and the real
  entrypoint shell logic with stub commands. No migrations or seeds run.
- `pnpm test:integration`: requires Docker; creates a dedicated PG18 tmpfs container
  on a random loopback port, applies migrations and tiny generated parquet fixtures,
  then removes that container. Never uses `.env.local`, `.env.prod` or Compose volumes.
  Covers rollback, ambiguous COMMIT, target/source changes, legacy handling, locks,
  fines replay/staging loss and atomic fresh cleanup.
- `pnpm exec playwright install chromium` once, then `pnpm build && pnpm test:browser`.
  The suite owns localhost:3100 (no server reuse), intercepts API traffic and gives the
  server an unreachable fixture DB URL. Covers focus/inert/Escape, request cancellation,
  retry, slider remounts and reduced-motion camera readiness/no-remeshing.
- CI currently runs lint/typecheck/unit tests; integration/browser checks are separate
  local commands, not implicitly included in `pnpm test`.

## Env files (agents)

- `.env.local` — local Next + host scripts (`pnpm seed`, `pnpm prisma:deploy`).
- `.env.prod` — remote admin only (`pnpm seed:prod`, migrate/studio against prod).
  Never print, commit, or paste `DATABASE_URL` / `DIRECT_URL` values.
- `.env.example` — tracked template only.
- Both Studio scripts load their env file via dotenv. Compose interpolation reads
  shell/`.env`, not `.env.local`: use `SEED_LIMIT=0 docker compose up` / `pnpm up:full`.
- Development output is `.next-dev`; production build/start uses `.next`.

## Data and querying notes

- State codes are lowercase two-letter codes in data/UI.
- Full-text search is Postgres `tsvector` + GIN index (`search_vector` is GENERATED).
- `data/queries/laws.ts` uses parameterized SQL; only whitelisted sort fields are interpolated.
  Place search boosts city/county slug hits with `IS TRUE` (nullable `OR` is NULL and
  sorts first under `DESC`).
- `/api/laws` returns law summaries; `/api/laws/[id]` (`getLawById`) returns the full law on demand.
  List failures are **503**; law-detail failures are **500**, not empty successes.
- List pagination fetches `pageSize + 1`, returns at most `pageSize` rows, and exposes
  `hasNextPage`. Never derive continuation from a planner estimate or saved aggregate.
  `totalKind` is `exact` / `estimated` / `unavailable`; unavailable means `total: null`.
  Estimates display as `About`, without a total page count; unavailable totals show the
  observed row range. A terminal nonempty page (including a full one) or empty first
  page proves the total. Empty out-of-range pages cannot use their offset as an exact count.
  Saved counts remain exact only when consistent with observed rows. No per-page full COUNT.
  Regression checks should force estimate under/overcounts and failures rather than depend
  on a particular planner estimate, then compare real page boundaries with SQL.
- `GET /api/jurisdictions` is the US map payload only (state + national). Short CDN cache
  (`s-maxage=60`, SWR 300) when `national` and `rows` are present. Do not cache
  `national: null` / empty rows. `/api/jurisdictions/[state]` stays `no-store` /
  `force-dynamic`. Do not reintroduce `force-static` or hour-long cache on these routes.
- US queries run after `connection()`, not during build. State core failures propagate
  to 503; optional penalty/fill failures preserve scores/native fills.
- Client retries abort and invalidate the current resource. Results do not display
  previous-key rows during loading/errors. Place clear/reset/unmount cancels requests;
  pending multi-axis edits survive debounce and responsive unmount.
- Place lookup is `GET /api/places?city=` / `?county=` (`resolvePlace`, `no-store`).
  Client `lookupPlaces` must not hit `/api/jurisdictions?...`.
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
- One readiness-gated camera target handles selection, resize and repaint; reduced
  motion snaps rather than tweening. Failed atlas imports can be retried.
- Desktop and mobile layer buttons expose the selected axis/Fines layer with `aria-pressed`.
- Native modal dialogs trap focus, make the background inert, dismiss on Escape
  and restore the invoking control's focus.

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
  `city_county` / `county_fills`.

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

Flags: `--fresh` (atomically TRUNCATE laws + **law_fines** + **place_penalties** + jurisdictions +
seed_checkpoints + import_progress + city_county + county_fills; drop legacy/current
fines staging; then clear legacy local progress), `--limit N` (total database-row ceiling;
partial shards keep atomic progress, not a completed checkpoint), `--shards 0,1`,
`--shards ''` (no COPY — recompute
national/state/**county** aggregates, then city fills and fines/place penalties).

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
3. Each batch updates `import_progress` in the same transaction as COPY: source
   `locus-v1/0000`…`0007`, SHA256 file fingerprint and committed prefix length.
   `.locus-cache/seed-progress.json` is no longer read/written; `--fresh` clears it.
4. Whole-shard completion writes `seed_checkpoints` and marks progress complete in one
   transaction. Resume verifies stored law count against completed + partial counts.
   Completed legacy checkpoints are preserved without retroactively inventing fingerprints;
   legacy partial imports with unaccounted rows refuse resume. Reconcile deliberately;
   never suggest automatic `--fresh` on a populated database.
5. Recomputes `jurisdictions` (1× `national` + 1× `state` per distinct non-empty
   state code + 1× `county` per `(state, county)` with a non-empty county slug).
6. Rebuilds `city_county` + `county_fills` from `laws` + Census 2020 place/county
   files (`pnpm build:city-county` does this without parquet COPY).
7. Rebuilds `law_fines` and `place_penalties` from LOCUS-Fines (`pnpm build:fines`).
   Both derived builders are non-fatal: failures warn; the seeder reconnects/reacquires
   its lock before continuing. A reconnect failure still stops the job.
8. `search_vector` is GENERATED — never written by the seeder.

### Resilience (remote-aware)

Managed Postgres (Prisma) can **silently stall** mid-COPY with no error. The seeder:

- Sets a short load-phase `statement_timeout` (~45s) and a client COPY watchdog (~90s) that
  destroys the socket on hang.
- Retries the current shard up to 8 times with reconnect/backoff. Each retry reads
  committed DB progress/counts, including when COMMIT succeeded but its reply was lost.
  Source mismatch/unverifiable progress errors stop immediately.
- **Must** attach a `pg` Client `error` listener so socket destroy does not crash Node before retry.
- Disables/long-timeouts for TRUNCATE and `computeAggregates` (full-table scans over 2.2M rows).

`connectWriter`/`acquireWriter` enforce a shared database-local session advisory lock
across seed and both builders. All writes use the owning connection; closing it releases
the lock. Old versions/manual SQL do not participate, so still inspect competing jobs.
Apply the additive import-progress migration before invoking the new seed/fines importer.

Always ensure a **single writer**. Inspect running seed/build jobs; never use a broad
process-kill pattern. Terminate only an identified job you own when interruption is intended:

```bash
pgrep -fl 'data/(seed|build-fines|build-city-county)\.ts'
```

### How to run (agent pattern)

1. Confirm the intended database and no competing writers (above).
2. Prefer background + log so the session stays usable:

```bash
mkdir -p /tmp/viz-seed
nohup pnpm seed </dev/null >/tmp/viz-seed/seed-local.log 2>&1 &
echo $! > /tmp/viz-seed/seed.pid
# monitor: tail -f /tmp/viz-seed/seed-local.log
# Remote administration only when requested; never add --fresh to a resume.
```

3. If editing `data/seed.ts`, run `pnpm typecheck`, branch off `main`, PR only the seeder/docs change.
4. Do **not** re-run migrations on prod unless schema work is in scope (tables/indexes are durable).

### Measured duration baselines (not guarantees)

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
- **Replay-safe staging.** `law_fines_import_v2` assigns deterministic model-row ordinals.
  Each COPY and fingerprinted `import_progress` prefix commit together; reconnect resumes
  from that prefix. Count/max ordinal must agree with progress. Legitimate duplicate
  source rows are preserved until the deliberate identity-key deduplication step.
- **Explicit restage after loss/legacy data.** UNLOGGED staging survives client interruption,
  not a database crash. Missing/changed staging, source mismatch or a legacy
  `law_fines_import` table stops the builder; `pnpm build:fines --restage` explicitly clears
  staging/progress. Successful builds drop both atomically. The standalone builder retries
  transient errors up to eight times, reconnecting under the shared writer lock.
  The final attach is transactional, but TRUNCATE takes ACCESS EXCLUSIVE and blocks
  readers; previous rows are not continuously readable during the rebuild.
- **Timings** (full corpus, parquet cached): local Docker **~40 s** end to end. Remote is
  dominated by the COPY of 632k narrow rows over the WAN plus one server-side hash join;
  budget **~10–30 min** and expect the same stall/reconnect behaviour as the corpus seed.
- Run requested remote builds background + logged, single writer; inspect jobs using
  `pgrep`, never a broad `pkill` command.

### Verification (after any full seed)

Historical full-corpus baselines (sampled databases differ):

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
