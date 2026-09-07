# visualize laws

Explore and compare U.S. local laws with full-text search, filters, jurisdiction aggregates, and an interactive map. The current corpus is LOCUS-v1, covering roughly 2.2 million local ordinances.

## docker quick start

With Docker running:

```bash
docker compose up
```

This starts Postgres and the app, applies migrations, loads the default sample on a fresh database, and serves the app at `http://localhost:3000`.

Useful Docker commands:

```bash
pnpm up          # same as docker compose up
pnpm up:build    # rebuild before starting
pnpm db:down     # stop the database and app
```

If you move or rename the repository directory, recreate the containers:

```bash
docker compose up -d --force-recreate
```

## local development

Run Postgres in Docker and the app on your machine:

```bash
pnpm install
cp .env.example .env.local
pnpm db:up
pnpm prisma:deploy
pnpm dev
```

Prefer `pnpm prisma:deploy` to apply existing migrations. Use `pnpm prisma:migrate` only when creating a new migration.

## seeding

Load the default sample:

```bash
pnpm seed --limit 25000
```

Load the complete corpus:

```bash
pnpm db:up
pnpm seed
```

You can also seed from the app container:

```bash
docker compose exec app pnpm seed
```

Helpful options:

```bash
pnpm seed --fresh       # reset and reseed
pnpm seed --limit 1000  # small local sample
pnpm seed --shards 0,1  # selected data shards
pnpm seed --shards ''   # rebuild aggregates, city fills and fines (no corpus COPY)
```

The default 25k sample is Alaska-only (start of shard 0). On a disposable local database,
replace it with Colorado (Pagosa Springs, El Paso County) using the following.
`--fresh` deletes existing laws and derived data:

```bash
pnpm seed --fresh --shards 1 --limit 25000
```

New imports resume from database-owned progress; rerun without `--fresh` to continue.
`--limit` caps the total stored laws, not additional rows. Older partial imports may
require reconciliation; the seeder will stop rather than guess a resume position.

After applying the city-index migration on a database that already has laws, recompute county aggregates:

```bash
pnpm seed --shards ''
```

### fines data

`pnpm seed` also loads the [LOCUS-Fines](https://huggingface.co/datasets/LocalLaws/LOCUS-Fines)
supplement, which annotates laws with the fines they state. To (re)build just that layer on a
database that already has laws:

```bash
pnpm prisma:deploy
pnpm build:fines
```

Only annotated rows are stored, so a law with no fine record was not checked — not that it
carries no fine. Amounts are checked against the source text; the surrounding labels are not.

## common commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm db:studio
```

Additional regression checks:

All tests live in `tests/`: `unit/` mirrors source paths, `integration/` contains
database fixtures, and `browser/` contains Playwright specs. `pnpm test` discovers
unit tests automatically; the other suites run separately.

```bash
pnpm test:integration                  # Docker required; disposable database only
pnpm exec playwright install chromium # once
pnpm build && pnpm test:browser        # mocked APIs, localhost:3100
```

## attribution

This project uses the LOCUS-v1 corpus.

```bibtex
@article{peskoff2026freeing,
  title={Freeing the Law with LOCUS: A Local Ordinance Corpus for the United States},
  author={Peskoff, Denis and Barrow, Joe and Vu, Christopher and Davenport, Diag},
  journal={arXiv preprint arXiv:2606.19334},
  year={2026}
}
```

[Paper](https://arxiv.org/abs/2606.19334) · [Models and dataset](https://huggingface.co/LocalLaws)

## license

Contribution guidance is in [CONTRIBUTING.md](./CONTRIBUTING.md).

Licensed under Business Source License 1.1 (BUSL-1.1); see [LICENSE](./LICENSE).
