# LOCUS Explorer

> Explore the complete [LOCUS-v1](https://huggingface.co/datasets/LocalLaws/LOCUS-v1) corpus of
> ~2.2M U.S. local laws — server-side search & filtering, an interactive HTML5 Canvas choropleth
> map, and per-jurisdiction stats. Next.js 15 · Prisma · Postgres · styled-components · framer-motion.

This README is finalized during integration. Quick start:

```bash
pnpm install
cp .env.example .env
pnpm db:up            # start local Postgres (Docker)
pnpm prisma:deploy    # apply migrations
pnpm seed --limit 25000   # fast sample seed for development
pnpm dev              # http://localhost:3000
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution workflow. MIT licensed.
