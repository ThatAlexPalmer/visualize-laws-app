/**
 * LOCUS Explorer seed — PLACEHOLDER (implemented by agent-seed, feat/seed-pipeline).
 *
 * Target implementation:
 *   - Stream the 8 LOCUS-v1 parquet shards (@dsnp/parquetjs) from Hugging Face.
 *   - Bulk-load into `laws` via Postgres COPY (pg + pg-copy-streams), ~10k/batch.
 *   - Track completed shards in `seed_checkpoints` for resumability.
 *   - Compute `jurisdictions` aggregates (national + state) + per-axis bounds.
 *   - Support `--limit N` (sample) and `--shards a,b` flags; progress logging.
 *
 * Usage (once implemented):
 *   pnpm seed --limit 25000     # fast sample for local dev
 *   pnpm seed                   # full ~2.2M-row ingest
 */
console.log(
  "scripts/seed.ts is a placeholder. The real ingest is implemented by agent-seed.",
);
