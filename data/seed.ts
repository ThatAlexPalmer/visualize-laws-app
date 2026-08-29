/**
 * LOCUS Explorer — corpus seeder (agent-seed / feat/seed-pipeline).
 *
 * Streams the 8 LOCUS-v1 parquet shards from Hugging Face, bulk-loads them into
 * the `laws` table via Postgres COPY, tracks completed shards in
 * `seed_checkpoints` for resumability, then recomputes the `jurisdictions`
 * aggregates (national + per-state + per-county) and city_county / county_fills.
 *
 * Usage:
 *   pnpm seed                  # full ~2.2M-row ingest (all 8 shards)
 *   pnpm seed --limit 5000     # fast dev sample (stop after N rows)
 *   pnpm seed --shards 0,1     # only the given shards
 *   pnpm seed --fresh          # TRUNCATE laws + jurisdictions + checkpoints + fills
 *   pnpm build:city-county     # rebuild city fills only (no parquet COPY)
 *   pnpm build:fines           # rebuild the LOCUS-Fines layer only
 *
 * Design notes:
 *   - `laws.search_vector` is a GENERATED column; it is never written here.
 *   - Each COPY batch commits on its own so a remote stall only loses the
 *     in-flight batch. Intra-shard progress is stored in
 *     `.locus-cache/seed-progress.json` and rows already committed are skipped
 *     on retry. A finished shard also gets a `seed_checkpoints` row (skip whole
 *     shard). A `--limit` cutoff leaves the shard un-checkpointed (partial) —
 *     intentional for dev samples; use `--fresh` to reset.
 *   - This is a tsx script run from the repo root: shared code is imported via
 *     the sibling `./types` module (no `@/` alias outside the Next build).
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { ParquetReader } from "@dsnp/parquetjs";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

import { buildCityCountyTables } from "./build-city-county";
import { buildFinesTable } from "./build-fines";
import { STATE_NAMES } from "./types";

// --- Configuration ---------------------------------------------------------

const SHARD_COUNT = 8;
// Smaller COPY batches waste less work if a remote load stalls mid-batch.
const BATCH_SIZE = 5_000;
// Resilience for long COPY loads over a managed/remote Postgres: retry a shard
// on a fresh connection if the socket drops / stalls mid-load.
const MAX_SHARD_ATTEMPTS = 8;
const RETRY_BACKOFF_MS = 2_000;
// Fail-fast on hung COPY batches (Prisma Postgres stalls have been silent).
// Aggregates over ~2.2M rows need a long/disabled timeout separately.
const LOAD_STATEMENT_TIMEOUT_MS = 45_000;
// Client watchdog slightly above statement_timeout so PG can cancel first;
// still short enough that silent stalls recover quickly.
const LOAD_QUERY_TIMEOUT_MS = 90_000;
const AGG_STATEMENT_TIMEOUT_MS = 0; // 0 = disabled
const CACHE_DIR = resolve(process.cwd(), ".locus-cache");
const PROGRESS_PATH = resolve(CACHE_DIR, "seed-progress.json");
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Local intra-shard progress: shard id -> rows already committed. */
type ProgressMap = Record<string, number>;

function readProgress(): ProgressMap {
  try {
    if (!existsSync(PROGRESS_PATH)) return {};
    const raw = JSON.parse(readFileSync(PROGRESS_PATH, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: ProgressMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}

function writeProgress(map: ProgressMap): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  writeFileSync(PROGRESS_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
}

function clearProgress(): void {
  try {
    if (existsSync(PROGRESS_PATH)) unlinkSync(PROGRESS_PATH);
  } catch {
    /* ignore */
  }
}

function setShardProgress(shard: string, rows: number): void {
  const map = readProgress();
  if (rows <= 0) {
    delete map[shard];
  } else {
    map[shard] = rows;
  }
  writeProgress(map);
}

function getShardProgress(shard: string): number {
  return readProgress()[shard] ?? 0;
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

/** Reject if `promise` does not settle within `ms` (and run `onTimeout`). */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          try {
            onTimeout?.();
          } catch {
            /* ignore */
          }
          reject(
            new Error(
              `${label} timed out after ${ms}ms (likely stalled COPY/load)`,
            ),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Write a batch of COPY lines on the current transaction/connection. */
async function copyBatch(client: Client, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const stream = client.query(copyFrom(COPY_SQL));
  // Client-side watchdog: statement_timeout alone has not always aborted silent
  // remote stalls; destroying the socket forces the retry/reconnect path.
  await withTimeout(
    pipeline(Readable.from(lines, { objectMode: false }), stream),
    LOAD_QUERY_TIMEOUT_MS,
    `COPY batch (${lines.length} rows)`,
    () => {
      try {
        const sock = (client as any).connection?.stream as
          | { destroy?: (err?: Error) => void }
          | undefined;
        sock?.destroy?.(new Error("COPY watchdog timeout"));
      } catch {
        /* ignore */
      }
    },
  );
}

interface ShardResult {
  /** Rows newly committed on this call (excludes already-skipped progress). */
  rows: number;
  /** Total rows for the shard after this call (including prior progress). */
  shardTotal: number;
  complete: boolean;
}

/**
 * Load a single shard with per-batch commits. Local progress tracks how many
 * rows are already in the DB so a stalled/retried attempt skips them. When the
 * shard finishes we write `seed_checkpoints` and clear local progress. A
 * `--limit` cutoff stops early without a full-shard checkpoint.
 */
async function loadShard(
  client: Client,
  file: string,
  n: number,
  opts: { limit?: number; alreadyLoaded: number },
): Promise<ShardResult> {
  const id = shardId(n);
  const skipRows = getShardProgress(id);
  const reader = await ParquetReader.openFile(file);
  const cursor = reader.getCursor();

  // Fail-fast for hung COPY; aggregates set their own longer timeout later.
  await client.query(`SET statement_timeout = ${LOAD_STATEMENT_TIMEOUT_MS}`);

  let seen = 0; // rows read from parquet (including skipped)
  let committed = skipRows; // rows known committed for this shard
  let newlyCommitted = 0;
  let complete = true;
  let batch: string[] = [];
  let batchStart = Date.now();

  if (skipRows > 0) {
    console.log(
      `  [shard ${n + 1}/${SHARD_COUNT}] resuming — skipping first ${fmt(skipRows)} rows`,
    );
  }

  const flushBatch = async (): Promise<void> => {
    if (batch.length === 0) return;
    const size = batch.length;
    await client.query("BEGIN");
    try {
      await copyBatch(client, batch);
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore — connection likely gone */
      }
      throw err;
    }
    newlyCommitted += size;
    committed += size;
    setShardProgress(id, committed);
    const dt = (Date.now() - batchStart) / 1000;
    const rate = dt > 0 ? Math.round(size / dt) : 0;
    console.log(
      `  [shard ${n + 1}/${SHARD_COUNT}] +${fmt(size)} ` +
        `(shard ${fmt(committed)}, total ${fmt(opts.alreadyLoaded + committed)}) — ` +
        `${fmt(rate)} rows/s`,
    );
    batch = [];
    batchStart = Date.now();
  };

  try {
    for (;;) {
      const record = (await cursor.next()) as unknown as RawRow | null;
      if (!record) break;
      seen++;
      if (seen <= skipRows) continue;

      if (opts.limit !== undefined) {
        const loadedSoFar = opts.alreadyLoaded + committed + batch.length;
        if (loadedSoFar >= opts.limit) {
          complete = false;
          break;
        }
      }

      batch.push(encodeRow(record));
      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }
    await flushBatch();

    if (complete) {
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO seed_checkpoints (shard, rows_loaded)
           VALUES ($1, $2)
           ON CONFLICT (shard)
           DO UPDATE SET rows_loaded = EXCLUDED.rows_loaded, completed_at = now()`,
          [id, committed],
        );
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
      setShardProgress(id, 0);
    }
  } finally {
    await reader.close();
  }

  return { rows: newlyCommitted, shardTotal: committed, complete };
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

// County display name: initcap of the LOCUS slug with underscores as spaces
// (`el_paso_county` → `El Paso County`). Slug is stored lowercased.
const COUNTY_AGG_SQL = `
INSERT INTO jurisdictions
  (level, state, county, name, law_count, substantive_count,
   avg_opacity, avg_enforcement_discretion, avg_paternalism, avg_problem_salience)
SELECT
  'county',
  l.state,
  lower(l.county),
  initcap(replace(lower(l.county), '_', ' ')),
  count(*)::int,
  count(*) FILTER (WHERE l.is_substantive)::int,
  COALESCE(avg(l.opacity), 0),
  COALESCE(avg(l.enforcement_discretion), 0),
  COALESCE(avg(l.paternalism), 0),
  COALESCE(avg(l.problem_salience), 0)
FROM laws l
WHERE l.state IS NOT NULL AND l.state <> ''
  AND l.county IS NOT NULL AND l.county <> ''
GROUP BY l.state, lower(l.county)
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
 * Recompute the national + per-state + per-county aggregate rows from the
 * current `laws` table, in one transaction. We DELETE the existing aggregate
 * rows first: the unique index (level, state, county) treats NULLs as distinct,
 * so ON CONFLICT alone would not dedupe the NULL-county rows on a re-run.
 */
async function computeAggregates(client: Client): Promise<void> {
  // Full-table scans over ~2.2M rows can exceed the load-phase timeout.
  await client.query(`SET statement_timeout = ${AGG_STATEMENT_TIMEOUT_MS}`);
  await client.query("BEGIN");
  try {
    await client.query(
      "DELETE FROM jurisdictions WHERE level IN ('state', 'national', 'county')",
    );
    await client.query(STATE_AGG_SQL, [JSON.stringify(STATE_NAMES)]);
    await client.query(COUNTY_AGG_SQL);
    await client.query(NATIONAL_AGG_SQL);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
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

  const connect = async (): Promise<Client> => {
    const c = new Client({
      connectionString,
      // TCP keepalive so a silently-dropped managed-DB connection surfaces as an
      // error instead of blocking a COPY forever. Do NOT set client query_timeout
      // globally — TRUNCATE/aggregates over 2.2M rows legitimately take longer;
      // COPY batches use an explicit watchdog in copyBatch instead.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      connectionTimeoutMillis: 30_000,
      statement_timeout: LOAD_STATEMENT_TIMEOUT_MS,
    });
    // Destroying the socket on COPY stall emits Client 'error'. Without a
    // listener Node treats it as uncaught and kills the process before retry.
    c.on("error", (err) => {
      console.warn(`  pg client error (will reconnect if in retry path): ${err.message}`);
    });
    await c.connect();
    await c.query(`SET statement_timeout = ${LOAD_STATEMENT_TIMEOUT_MS}`);
    // Avoid idle-in-transaction stalls on managed Postgres during long loads.
    await c.query("SET idle_in_transaction_session_timeout = 120000");
    return c;
  };
  let client = await connect();

  const startedAt = Date.now();
  try {
    if (opts.fresh) {
      console.log(
        "--fresh: truncating laws, law_fines, jurisdictions, seed_checkpoints, city_county, county_fills",
      );
      // Truncate can be slow on a large partial table — disable statement timeout.
      await client.query(`SET statement_timeout = ${AGG_STATEMENT_TIMEOUT_MS}`);
      // law_fines must be in this list: it carries an FK to laws, so Postgres
      // rejects the TRUNCATE otherwise. Its rows are keyed by law id, which is
      // not stable across a fresh load, so they have to be rebuilt anyway.
      await client.query(
        "TRUNCATE TABLE laws, law_fines, jurisdictions, seed_checkpoints, city_county, county_fills RESTART IDENTITY",
      );
      await client.query(`SET statement_timeout = ${LOAD_STATEMENT_TIMEOUT_MS}`);
      clearProgress();
    }

    if (opts.shards.length === 0) {
      console.warn("No valid shards selected — only recomputing aggregates.");
    } else {
      const limitLabel = opts.limit ? ` (limit ${fmt(opts.limit)})` : "";
      console.log(`Seeding shards [${opts.shards.join(", ")}]${limitLabel}…`);
    }

    const completed = await getCompletedShards(client);
    // Prefer DB law count so resume runs have a sensible "alreadyLoaded" baseline.
    const priorCount = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM laws",
    );
    let total = priorCount.rows[0]?.n ?? 0;
    if (total > 0) {
      console.log(`Existing laws rows: ${fmt(total)} (resume baseline)`);
    }
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
      let result: ShardResult | undefined;
      for (let attempt = 1; attempt <= MAX_SHARD_ATTEMPTS; attempt++) {
        try {
          result = await loadShard(client, file, n, {
            limit: opts.limit,
            alreadyLoaded: total,
          });
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `  shard ${n + 1}/${SHARD_COUNT} attempt ${attempt}/${MAX_SHARD_ATTEMPTS} failed: ${msg}`,
          );
          try {
            await client.end();
          } catch {
            /* ignore */
          }
          if (attempt >= MAX_SHARD_ATTEMPTS) throw err;
          await sleep(RETRY_BACKOFF_MS * attempt);
          console.log(`  reconnecting to retry shard ${n + 1}/${SHARD_COUNT}…`);
          client = await connect();
        }
      }
if (!result) throw new Error(`shard ${n + 1}/${SHARD_COUNT} failed`);
      // newlyCommitted this call only — prior progress / other shards already in `total`.
      total += result.rows;
      console.log(
        `shard ${n + 1}/${SHARD_COUNT}: ` +
          `${result.complete ? "complete" : "partial (limit)"} — ` +
          `+${fmt(result.rows)} this run / ${fmt(result.shardTotal)} shard ` +
          `(total ${fmt(total)})`,
      );
      if (!result.complete) {
        stoppedAtLimit = true;
        break;
      }
    }

    console.log("Recomputing aggregates…");
    await computeAggregates(client);

    console.log("Building city_county + county_fills…");
    try {
      const fillStats = await buildCityCountyTables(client);
      console.log(
        `  city_county: ${fmt(fillStats.cities)} cities → ` +
          `${fmt(fillStats.oneCounty)} one-county · ${fmt(fillStats.multi)} multi · ` +
          `${fmt(fillStats.unmatched)} unmatched`,
      );
      console.log(
        `  county_fills: ${fmt(fillStats.nativeFills)} native + ` +
          `${fmt(fillStats.cityFills)} city (${fmt(fillStats.uniqueFips)} FIPS)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `  city/county build skipped (${msg}). Run \`pnpm build:city-county\` after migrate.`,
      );
    }

    console.log("Building law_fines (LOCUS-Fines supplement)…");
    try {
      const fineStats = await buildFinesTable(client, { connectionString });
      console.log(
        `  law_fines: ${fmt(fineStats.matched)} attached from ` +
          `${fmt(fineStats.staged)} model rows · ` +
          `${fmt(fineStats.withAmount)} with a dollar amount`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `  fines build skipped (${msg}). Run \`pnpm build:fines\` after migrate.`,
      );
    }

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
