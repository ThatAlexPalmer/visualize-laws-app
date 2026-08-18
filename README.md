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
pnpm seed --shards ''   # recompute jurisdiction aggregates only (no COPY)
```

The default 25k sample is Alaska-only (start of shard 0). For city/county QA (Pagosa Springs, El Paso County) load Colorado from shard 1:

```bash
pnpm seed --fresh --shards 1 --limit 25000
```

After applying the city-index migration on a database that already has laws, recompute county aggregates:

```bash
pnpm seed --shards ''
```

## common commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm db:studio
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

Licensed under Business Source License 1.1 (BUSL-1.1); see [LICENSE](./LICENSE).
