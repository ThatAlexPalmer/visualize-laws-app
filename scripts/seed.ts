/**
 * LOCUS Explorer — corpus seeder (agent-seed / feat/seed-pipeline).
 *
 * Streams the 8 LOCUS-v1 parquet shards from Hugging Face, bulk-loads them into
 * the `laws` table via Postgres COPY, tracks completed shards in
 * `seed_checkpoints` for resumability, then recomputes the `jurisdictions`
 * aggregates (national + per-state) with per-axis bounds.
 *
 * Usage:
 *   pnpm seed                  # full ~2.2M-row ingest (all 8 shards)
 *   pnpm seed --limit 5000     # fast dev sample (stop after N rows)
 *   pnpm seed --shards 0,1     # only the given shards
 *   pnpm seed --fresh          # TRUNCATE laws + jurisdictions + checkpoints first
 *
 * Design notes:
 *   - `laws.search_vector` is a GENERATED column; it is never written here.
 *   - Each shard is loaded inside ONE transaction together with its checkpoint
 *     row, so an interrupted run rolls back cleanly and a re-run resumes without
 *     duplicating rows. A `--limit` cutoff leaves the shard un-checkpointed
 *     (partial) — that is intentional for dev samples; use `--fresh` to reset.
 *   - This is a tsx script: shared code is imported via the relative `../lib`
 *     path (the `@/` alias only resolves inside the Next build).
 */
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { ParquetReader } from "@dsnp/parquetjs";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

import { STATE_NAMES } from "../lib/types";

// --- Configuration ---------------------------------------------------------

const SHARD_COUNT = 8;
const BATCH_SIZE = 10_000;
const CACHE_DIR = resolve(process.cwd(), ".locus-cache");
const HF_BASE =
  "https://huggingface.co/datasets/LocalLaws/LOCUS-v1/resolve/refs%2Fconvert%2Fparquet/default/train";

// `function` is quoted because it is a SQL keyword. `search_vector` is omitted
// on purpose (it is a generated column).
const COPY_SQL =
  'COPY laws (header, content, is_substantive, "function", topic, ' +
  "source_jurisdiction_type, state, city, county, enforcement_discretion, " +
  "opacity, paternalism, problem_salience) FROM STDIN";

// --- Minimal .env loader (tsx does not auto-load .env) ---------------------

function loadEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice("export ".length).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// --- CLI -------------------------------------------------------------------

interface CliOptions {
  limit?: number;
  shards: number[];
  fresh: boolean;
}

function parseShards(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < SHARD_COUNT);
}

function parseArgs(argv: string[]): CliOptions {
  let limit: number | undefined;
  let shards: number[] | undefined;
  let fresh = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fresh") {
      fresh = true;
    } else if (arg === "--limit") {
      limit = Number.parseInt(argv[++i] ?? "", 10);
    } else if (arg.startsWith("--limit=")) {
      limit = Number.parseInt(arg.slice("--limit=".length), 10);
    } else if (arg === "--shards") {
      shards = parseShards(argv[++i] ?? "");
    } else if (arg.startsWith("--shards=")) {
      shards = parseShards(arg.slice("--shards=".length));
    }
  }

  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`--limit must be a positive integer (got "${limit}")`);
  }

  return {
    limit,
    shards: shards ?? Array.from({ length: SHARD_COUNT }, (_, i) => i),
    fresh,
  };
}

// --- Value coercion + COPY (text format) encoding --------------------------

interface RawRow {
  header?: unknown;
  content?: unknown;
  is_substantive?: unknown;
  function?: unknown;
  topic?: unknown;
  source_jurisdiction_type?: unknown;
  state?: unknown;
  city?: unknown;
  county?: unknown;
  enforcement_discretion?: unknown;
  opacity?: unknown;
  paternalism?: unknown;
  problem_salience?: unknown;
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  return String(value);
}

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value === null || value === undefined) return NaN;
  return Number(value);
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    return v === "true" || v === "t" || v === "1";
  }
  return Boolean(value);
}

/** Escape a value for the Postgres COPY *text* format (tab-delimited, \\N = null). */
function text(value: string | null): string {
  if (value === null) return "\\N";
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function bool(value: boolean): string {
  return value ? "t" : "f";
}

function num(value: number): string {
  if (Number.isFinite(value)) return String(value);
  if (Number.isNaN(value)) return "NaN";
  return value > 0 ? "Infinity" : "-Infinity";
}

/** Render one parquet record as a COPY text-format line (trailing newline). */
function encodeRow(r: RawRow): string {
  return (
    [
      text(toStr(r.header)),
      text(toStr(r.content) ?? ""), // content is NOT NULL
      bool(toBool(r.is_substantive)),
      text(toStr(r.function)),
      text(toStr(r.topic)),
      text(toStr(r.source_jurisdiction_type)),
      text((toStr(r.state) ?? "").toLowerCase()), // state is NOT NULL
      text(toStr(r.city)),
      text(toStr(r.county)),
      num(toNum(r.enforcement_discretion)),
      num(toNum(r.opacity)),
      num(toNum(r.paternalism)),
      num(toNum(r.problem_salience)),
    ].join("\t") + "\n"
  );
}

// --- Helpers ---------------------------------------------------------------

function shardId(n: number): string {
  return String(n).padStart(4, "0");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

async function getCompletedShards(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ shard: string }>(
    "SELECT shard FROM seed_checkpoints",
  );
  return new Set(rows.map((r) => r.shard));
}

/** Download a shard to the local cache if it is not already present. */
async function ensureShard(n: number): Promise<string> {
  const name = `${shardId(n)}.parquet`;
  const dest = resolve(CACHE_DIR, name);
  if (existsSync(dest)) {
    console.log(`  shard ${n + 1}/${SHARD_COUNT}: using cached ${name}`);
    return dest;
  }

  await mkdir(CACHE_DIR, { recursive: true });
  const url = `${HF_BASE}/${name}`;
  console.log(`  shard ${n + 1}/${SHARD_COUNT}: downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  // Stream to a .part file, then atomically rename so an interrupted download
  // never leaves a truncated file that looks complete.
  const tmp = `${dest}.part`;
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    createWriteStream(tmp),
  );
  await rename(tmp, dest);
  return dest;
}

/** Write a batch of COPY lines on the current transaction/connection. */
async function copyBatch(client: Client, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const stream = client.query(copyFrom(COPY_SQL));
  await pipeline(Readable.from(lines, { objectMode: false }), stream);
}

interface ShardResult {
  rows: number;
  complete: boolean;
}

/**
 * Load a single shard inside one transaction. When the shard is fully read we
 * also write its checkpoint in the same transaction, so the rows + checkpoint
 * commit atomically (crash-safe + resumable). A `--limit` cutoff stops early
 * and leaves the shard un-checkpointed (partial), which is fine for dev samples.
 */
async function loadShard(
  client: Client,
  file: string,
  n: number,
  opts: { limit?: number; alreadyLoaded: number },
): Promise<ShardResult> {
  const reader = await ParquetReader.openFile(file);
  const cursor = reader.getCursor();

  await client.query("BEGIN");
  let rows = 0;
  let complete = true;
  let batch: string[] = [];
  let batchStart = Date.now();

  try {
    for (;;) {
      const record = (await cursor.next()) as unknown as RawRow | null;
      if (!record) break;
      if (opts.limit !== undefined && opts.alreadyLoaded + rows >= opts.limit) {
        complete = false;
        break;
      }
      batch.push(encodeRow(record));
      rows++;
      if (batch.length >= BATCH_SIZE) {
        await copyBatch(client, batch);
        const dt = (Date.now() - batchStart) / 1000;
        const rate = dt > 0 ? Math.round(batch.length / dt) : 0;
        console.log(
          `  [shard ${n + 1}/${SHARD_COUNT}] +${fmt(batch.length)} ` +
            `(shard ${fmt(rows)}, total ${fmt(opts.alreadyLoaded + rows)}) — ` +
            `${fmt(rate)} rows/s`,
        );
        batch = [];
        batchStart = Date.now();
      }
    }
    if (batch.length > 0) await copyBatch(client, batch);

    if (complete) {
      await client.query(
        `INSERT INTO seed_checkpoints (shard, rows_loaded)
         VALUES ($1, $2)
         ON CONFLICT (shard)
         DO UPDATE SET rows_loaded = EXCLUDED.rows_loaded, completed_at = now()`,
        [shardId(n), rows],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await reader.close();
  }

  return { rows, complete };
}

// --- Aggregates ------------------------------------------------------------

// State name comes from the shared STATE_NAMES map (passed as $1::jsonb) and
// falls back to the uppercased code for any code not in the map.
const STATE_AGG_SQL = `
INSERT INTO jurisdictions
  (level, state, county, name, law_count, substantive_count,
   avg_opacity, avg_enforcement_discretion, avg_paternalism, avg_problem_salience)
SELECT
  'state',
  l.state,
  NULL,
  COALESCE($1::jsonb ->> l.state, upper(l.state)),
  count(*)::int,
  count(*) FILTER (WHERE l.is_substantive)::int,
  COALESCE(avg(l.opacity), 0),
  COALESCE(avg(l.enforcement_discretion), 0),
  COALESCE(avg(l.paternalism), 0),
  COALESCE(avg(l.problem_salience), 0)
FROM laws l
WHERE l.state IS NOT NULL AND l.state <> ''
GROUP BY l.state
ON CONFLICT (level, state, county) DO UPDATE SET
  name = EXCLUDED.name,
  law_count = EXCLUDED.law_count,
  substantive_count = EXCLUDED.substantive_count,
  avg_opacity = EXCLUDED.avg_opacity,
  avg_enforcement_discretion = EXCLUDED.avg_enforcement_discretion,
  avg_paternalism = EXCLUDED.avg_paternalism,
  avg_problem_salience = EXCLUDED.avg_problem_salience
`;

// `bounds` is per-axis [min,max] using the shared Axis camelCase keys.
const NATIONAL_AGG_SQL = `
INSERT INTO jurisdictions
  (level, state, county, name, law_count, substantive_count,
   avg_opacity, avg_enforcement_discretion, avg_paternalism, avg_problem_salience, bounds)
SELECT
  'national',
  NULL,
  NULL,
  'United States',
  count(*)::int,
  count(*) FILTER (WHERE is_substantive)::int,
  COALESCE(avg(opacity), 0),
  COALESCE(avg(enforcement_discretion), 0),
  COALESCE(avg(paternalism), 0),
  COALESCE(avg(problem_salience), 0),
  CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
    'opacity', jsonb_build_array(min(opacity), max(opacity)),
    'enforcementDiscretion', jsonb_build_array(min(enforcement_discretion), max(enforcement_discretion)),
    'paternalism', jsonb_build_array(min(paternalism), max(paternalism)),
    'problemSalience', jsonb_build_array(min(problem_salience), max(problem_salience))
  ) END
FROM laws
ON CONFLICT (level, state, county) DO UPDATE SET
  name = EXCLUDED.name,
  law_count = EXCLUDED.law_count,
  substantive_count = EXCLUDED.substantive_count,
  avg_opacity = EXCLUDED.avg_opacity,
  avg_enforcement_discretion = EXCLUDED.avg_enforcement_discretion,
  avg_paternalism = EXCLUDED.avg_paternalism,
  avg_problem_salience = EXCLUDED.avg_problem_salience,
  bounds = EXCLUDED.bounds
`;

/**
 * Recompute the national + per-state aggregate rows from the current `laws`
 * table, in one transaction. We DELETE the existing aggregate rows first: the
 * unique index (level, state, county) treats NULLs as distinct, so ON CONFLICT
 * alone would not dedupe the NULL-county rows on a re-run.
 */
async function computeAggregates(client: Client): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      "DELETE FROM jurisdictions WHERE level IN ('state', 'national')",
    );
    await client.query(STATE_AGG_SQL, [JSON.stringify(STATE_NAMES)]);
    await client.query(NATIONAL_AGG_SQL);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

// --- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  loadEnv();
  const opts = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DIRECT_URL / DATABASE_URL is not set (check your .env)");
  }

  const client = new Client({ connectionString });
  await client.connect();

  const startedAt = Date.now();
  try {
    if (opts.fresh) {
      console.log("--fresh: truncating laws, jurisdictions, seed_checkpoints");
      await client.query(
        "TRUNCATE TABLE laws, jurisdictions, seed_checkpoints RESTART IDENTITY",
      );
    }

    if (opts.shards.length === 0) {
      console.warn("No valid shards selected — only recomputing aggregates.");
    } else {
      const limitLabel = opts.limit ? ` (limit ${fmt(opts.limit)})` : "";
      console.log(`Seeding shards [${opts.shards.join(", ")}]${limitLabel}…`);
    }

    const completed = await getCompletedShards(client);
    let total = 0;
    let stoppedAtLimit = false;

    for (const n of opts.shards) {
      if (opts.limit !== undefined && total >= opts.limit) {
        stoppedAtLimit = true;
        break;
      }
      if (completed.has(shardId(n))) {
        console.log(
          `shard ${n + 1}/${SHARD_COUNT}: already complete — skipping`,
        );
        continue;
      }
      const file = await ensureShard(n);
      const result = await loadShard(client, file, n, {
        limit: opts.limit,
        alreadyLoaded: total,
      });
      total += result.rows;
      console.log(
        `shard ${n + 1}/${SHARD_COUNT}: ` +
          `${result.complete ? "complete" : "partial (limit)"} — ` +
          `${fmt(result.rows)} rows (total ${fmt(total)})`,
      );
      if (!result.complete) {
        stoppedAtLimit = true;
        break;
      }
    }

    console.log("Recomputing aggregates…");
    await computeAggregates(client);

    const lawsCount = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM laws",
    );
    const byLevel = await client.query<{ level: string; n: number }>(
      "SELECT level, count(*)::int AS n FROM jurisdictions GROUP BY level ORDER BY level",
    );
    const elapsed = Math.round((Date.now() - startedAt) / 1000);

    console.log(`\nDone in ${fmt(elapsed)}s.`);
    console.log(`  laws: ${fmt(lawsCount.rows[0]?.n ?? 0)}`);
    for (const r of byLevel.rows) {
      console.log(`  jurisdictions[${r.level}]: ${fmt(r.n)}`);
    }
    if (stoppedAtLimit) {
      console.log(
        "\nNote: stopped at --limit (sample). Partial shards are not " +
          "checkpointed; run `pnpm seed --fresh` before a full ingest to avoid " +
          "duplicate rows.",
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exitCode = 1;
});
