/**
 * Build `law_fines` from the LOCUS-Fines supplement + the current `laws` rows.
 * Additive: never rewrites `laws`, never re-COPYs the LOCUS-v1 corpus.
 *
 * Local (after pulling this branch):
 *   pnpm prisma:deploy
 *   pnpm build:fines
 *
 * `pnpm seed` also runs this once the corpus and aggregates are in place.
 * The supplement parquet caches under `.locus-cache/` (~87 MB).
 *
 * Why this does not use `@dsnp/parquetjs` like `data/seed.ts`:
 *   LOCUS-Fines is a single file with 1,048,576-row row groups (the LOCUS-v1
 *   shards use ~56k). `@dsnp/parquetjs` materializes a whole row group, which
 *   OOMs at the default heap and needs ~7.75 GB RSS to finish — far past what
 *   the Docker container has. `hyparquet` reads bounded row ranges instead and
 *   completes the same scan at ~1.2 GB peak.
 *
 * Shape of the load:
 *   1. Stream the parquet in `READ_CHUNK_ROWS` slices, keep only the rows the
 *      supplement's model actually read, and COPY them into an unlogged
 *      staging table in `COPY_BATCH_SIZE` batches (commit per batch).
 *   2. One server-side INSERT..SELECT dedupes staging on the seven-column
 *      identity key and hash-joins it to `laws`, recomputing the sha1
 *      fingerprint in Postgres (pgcrypto `digest`).
 *   3. Drop staging.
 *
 * Staging is left in place if the load dies partway, and a rerun resumes from
 * the row count already committed. Re-COPYing a batch whose COMMIT ack was
 * lost is harmless: step 2 dedupes.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import {
  asyncBufferFromFile,
  parquetMetadataAsync,
  parquetReadObjects,
} from "hyparquet";
import { Client } from "pg";
import { from as copyFrom } from "pg-copy-streams";

import {
  FINES_EXPECTED_ROWS,
  FINES_PARQUET_URL,
  FINES_STAGING_COLUMNS,
  encodeStagingRow,
  isModelAnnotated,
  type RawFineRow,
} from "./fines";

// --- Configuration ---------------------------------------------------------

const CACHE_DIR = resolve(process.cwd(), ".locus-cache");
const PARQUET_CACHE = resolve(CACHE_DIR, "locus-fines.parquet");

const STAGING_TABLE = "law_fines_import";
/** Parquet rows decoded per slice — bounds peak memory (~1.2 GB at 50k). */
const READ_CHUNK_ROWS = 50_000;
/** Matches the corpus seeder: a stalled remote COPY only loses this much. */
const COPY_BATCH_SIZE = 5_000;
const MAX_BATCH_ATTEMPTS = 8;
const RETRY_BACKOFF_MS = 2_000;
/** Fail fast on hung COPY; the join sets its own (disabled) timeout. */
const LOAD_STATEMENT_TIMEOUT_MS = 45_000;
/** Client watchdog sits just above statement_timeout so PG can cancel first. */
const LOAD_QUERY_TIMEOUT_MS = 90_000;
/** 0 = disabled. The join scans 2.2M rows and hashes every law body. */
const JOIN_STATEMENT_TIMEOUT_MS = 0;

const COPY_SQL = `COPY ${STAGING_TABLE} (${FINES_STAGING_COLUMNS.map(
  (c) => `"${c}"`,
).join(", ")}) FROM STDIN`;

// The seven identity columns, in the order used for both dedupe and join.
const IDENTITY_COLUMNS = [
  "state",
  "source_jurisdiction_type",
  "city",
  "county",
  "function",
  "header",
  "content_sha1",
] as const;

const CREATE_STAGING_SQL = `
CREATE UNLOGGED TABLE IF NOT EXISTS ${STAGING_TABLE} (
  row_no                      BIGSERIAL PRIMARY KEY,
  state                       TEXT NOT NULL,
  source_jurisdiction_type    TEXT NOT NULL,
  city                        TEXT NOT NULL,
  county                      TEXT NOT NULL,
  "function"                  TEXT NOT NULL,
  header                      TEXT NOT NULL,
  content_sha1                TEXT NOT NULL,
  annotation_source           TEXT NOT NULL,
  fine_relevant               BOOLEAN NOT NULL,
  penalty_scope               TEXT,
  penalty_stated              TEXT,
  fine_structure              TEXT,
  fixed_amount                DOUBLE PRECISION,
  min_amount                  DOUBLE PRECISION,
  max_amount                  DOUBLE PRECISION,
  first_violation_amount      DOUBLE PRECISION,
  second_violation_amount     DOUBLE PRECISION,
  subsequent_violation_amount DOUBLE PRECISION,
  effective_min               DOUBLE PRECISION,
  effective_max               DOUBLE PRECISION,
  per_day_violation           BOOLEAN NOT NULL,
  jail_mentioned              BOOLEAN NOT NULL,
  penalty_nature              TEXT,
  extraction_flag             TEXT,
  grounded                    BOOLEAN
)`;

/**
 * Dedupe + attach.
 *
 * `DISTINCT ON` collapses the duplicate identity groups that exist in LOCUS-v1
 * (2,411 groups / 5,200 rows), keeping the first staged row per key so the
 * result is deterministic. Those groups are textually identical sections, so
 * one annotation legitimately applies to every law row in the group — the join
 * still writes one `law_fines` row per matching law.
 *
 * NULLs are normalized to '' on the staging side at encode time and with
 * COALESCE on the laws side, keeping every predicate a plain equality so the
 * planner can hash-join. `IS NOT DISTINCT FROM` would be correct but is not
 * hashable, and degrades to a nested loop over 2.2M rows.
 */
const ATTACH_SQL = `
INSERT INTO law_fines (
  law_id, state, city, county, content_sha1, annotation_source,
  fine_relevant, penalty_scope, penalty_stated, fine_structure,
  fixed_amount, min_amount, max_amount,
  first_violation_amount, second_violation_amount, subsequent_violation_amount,
  effective_min, effective_max,
  per_day_violation, jail_mentioned, penalty_nature, extraction_flag, grounded
)
SELECT
  l.id,
  f.state,
  NULLIF(f.city, ''),
  NULLIF(f.county, ''),
  f.content_sha1,
  f.annotation_source,
  f.fine_relevant, f.penalty_scope, f.penalty_stated, f.fine_structure,
  f.fixed_amount, f.min_amount, f.max_amount,
  f.first_violation_amount, f.second_violation_amount,
  f.subsequent_violation_amount,
  f.effective_min, f.effective_max,
  f.per_day_violation, f.jail_mentioned, f.penalty_nature,
  f.extraction_flag, f.grounded
FROM (
  SELECT DISTINCT ON (${IDENTITY_COLUMNS.map((c) => `"${c}"`).join(", ")}) *
  FROM ${STAGING_TABLE}
  ORDER BY ${IDENTITY_COLUMNS.map((c) => `"${c}"`).join(", ")}, row_no
) f
JOIN laws l
  ON  l.state = f.state
  AND COALESCE(l.source_jurisdiction_type, '') = f.source_jurisdiction_type
  AND COALESCE(l.city, '') = f.city
  AND COALESCE(l.county, '') = f.county
  AND COALESCE(l."function", '') = f."function"
  AND COALESCE(l.header, '') = f.header
  AND substr(encode(digest(l.content, 'sha1'), 'hex'), 1, 16) = f.content_sha1
`;

const DISTINCT_KEYS_SQL = `
SELECT count(*)::bigint AS n FROM (
  SELECT 1 FROM ${STAGING_TABLE}
  GROUP BY ${IDENTITY_COLUMNS.map((c) => `"${c}"`).join(", ")}
) t`;

export interface FinesBuildStats {
  /** Rows in the supplement parquet. */
  parquetRows: number;
  /** Model-read rows staged (the rest are rule-derived and skipped). */
  staged: number;
  /**
   * Distinct identity keys in staging. Lower than `staged` because LOCUS-v1
   * repeats some sections verbatim.
   */
  distinctKeys: number;
  /**
   * `law_fines` rows written — one per matching *law* row, so this can exceed
   * `distinctKeys` when several identical law rows share one key.
   */
  matched: number;
  /** Stored rows carrying a dollar amount. */
  withAmount: number;
}

// --- Env (tsx does not auto-load .env) -------------------------------------

function loadEnv(): void {
  for (const name of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), name);
    if (!existsSync(envPath)) continue;
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
}

// --- Helpers ---------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function connectionStringFromEnv(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DIRECT_URL / DATABASE_URL is not set (check your .env.local)");
  }
  return url;
}

/** Download the supplement parquet into the cache if it is not already there. */
async function ensureParquet(): Promise<string> {
  if (existsSync(PARQUET_CACHE)) {
    console.log("  using cached locus-fines.parquet");
    return PARQUET_CACHE;
  }
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`  downloading ${FINES_PARQUET_URL}`);
  const res = await fetch(FINES_PARQUET_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download the fines parquet: HTTP ${res.status}`);
  }
  // Stream to .part then rename, so an interrupted download never leaves a
  // truncated file that looks complete.
  const tmp = `${PARQUET_CACHE}.part`;
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    createWriteStream(tmp),
  );
  await rename(tmp, PARQUET_CACHE);
  return PARQUET_CACHE;
}

/** Reject if `promise` does not settle in `ms`, running `onTimeout` first. */
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
          reject(new Error(`${label} timed out after ${ms}ms (stalled COPY?)`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function connectLoader(connectionString: string): Promise<Client> {
  const c = new Client({
    connectionString,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 30_000,
    statement_timeout: LOAD_STATEMENT_TIMEOUT_MS,
  });
  // Destroying the socket on a COPY stall emits Client 'error'; without a
  // listener Node treats it as uncaught and kills the process before retry.
  c.on("error", (err) => {
    console.warn(`  pg client error (will reconnect if retrying): ${err.message}`);
  });
  await c.connect();
  await c.query(`SET statement_timeout = ${LOAD_STATEMENT_TIMEOUT_MS}`);
  await c.query("SET idle_in_transaction_session_timeout = 120000");
  return c;
}

/** COPY one batch on the current connection, with a socket-level watchdog. */
async function copyBatch(client: Client, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const stream = client.query(copyFrom(COPY_SQL));
  await withTimeout(
    pipeline(Readable.from(lines, { objectMode: false }), stream),
    LOAD_QUERY_TIMEOUT_MS,
    `COPY batch (${lines.length} rows)`,
    () => {
      try {
        const conn = (client as unknown as {
          connection?: { stream?: { destroy?: (err?: Error) => void } };
        }).connection;
        conn?.stream?.destroy?.(new Error("COPY watchdog timeout"));
      } catch {
        /* ignore */
      }
    },
  );
}

// --- Build -----------------------------------------------------------------

export interface BuildFinesOptions {
  /** Overrides the env-derived URL for the dedicated COPY connection. */
  connectionString?: string;
  /** Discard any staging rows left by an earlier run instead of resuming. */
  restage?: boolean;
}

/**
 * Load the supplement into `law_fines`, using `client` for DDL and the final
 * attach. The COPY phase runs on its own connection so it can be torn down and
 * reconnected on a stall without disturbing the caller's client.
 */
export async function buildFinesTable(
  client: Client,
  opts: BuildFinesOptions = {},
): Promise<FinesBuildStats> {
  const file = await ensureParquet();

  await client.query(CREATE_STAGING_SQL);
  if (opts.restage) {
    console.log("  --restage: clearing staged rows");
    await client.query(`TRUNCATE TABLE ${STAGING_TABLE} RESTART IDENTITY`);
  }

  const staged0 = await client.query<{ n: string }>(
    `SELECT count(*)::bigint AS n FROM ${STAGING_TABLE}`,
  );
  const alreadyStaged = Number(staged0.rows[0]?.n ?? 0);
  if (alreadyStaged > 0) {
    console.log(
      `  resuming — ${fmt(alreadyStaged)} model rows already staged`,
    );
  }

  // --- 1. Stream parquet -> staging ---------------------------------------
  const connectionString = opts.connectionString ?? connectionStringFromEnv();
  let loader = await connectLoader(connectionString);
  const buffer = await asyncBufferFromFile(file);
  const metadata = await parquetMetadataAsync(buffer);
  const parquetRows = Number(metadata.num_rows);
  if (parquetRows !== FINES_EXPECTED_ROWS) {
    console.warn(
      `  note: parquet has ${fmt(parquetRows)} rows, expected ${fmt(FINES_EXPECTED_ROWS)}`,
    );
  }

  let modelRowsSeen = 0;
  let staged = alreadyStaged;
  let batch: string[] = [];

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const size = batch.length;
    for (let attempt = 1; ; attempt++) {
      try {
        await loader.query("BEGIN");
        try {
          await copyBatch(loader, batch);
          await loader.query("COMMIT");
        } catch (err) {
          try {
            await loader.query("ROLLBACK");
          } catch {
            /* connection likely gone */
          }
          throw err;
        }
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `  COPY batch attempt ${attempt}/${MAX_BATCH_ATTEMPTS} failed: ${msg}`,
        );
        if (attempt >= MAX_BATCH_ATTEMPTS) throw err;
        try {
          await loader.end();
        } catch {
          /* ignore */
        }
        await sleep(RETRY_BACKOFF_MS * attempt);
        console.log("  reconnecting to retry the batch…");
        loader = await connectLoader(connectionString);
      }
    }
    staged += size;
    batch = [];
    if (staged % 100_000 < size) {
      console.log(`  staged ${fmt(staged)} model rows`);
    }
  };

  try {
    for (let start = 0; start < parquetRows; start += READ_CHUNK_ROWS) {
      const rows = (await parquetReadObjects({
        file: buffer,
        metadata,
        rowStart: start,
        rowEnd: Math.min(start + READ_CHUNK_ROWS, parquetRows),
      })) as RawFineRow[];

      for (const row of rows) {
        if (!isModelAnnotated(row)) continue;
        modelRowsSeen++;
        // Resume: rows already committed by an earlier run are a prefix of the
        // model-row sequence, which is deterministic for a given parquet.
        if (modelRowsSeen <= alreadyStaged) continue;
        batch.push(encodeStagingRow(row));
        if (batch.length >= COPY_BATCH_SIZE) await flush();
      }
    }
    await flush();
  } finally {
    try {
      await loader.end();
    } catch {
      /* ignore */
    }
  }

  // --- 2. Dedupe + attach --------------------------------------------------
  console.log("  attaching staged annotations to laws…");
  await client.query(`SET statement_timeout = ${JOIN_STATEMENT_TIMEOUT_MS}`);
  // The hash table is ~632k narrow rows; the default 4MB work_mem would spill
  // it to disk. Best-effort: a managed instance may refuse the SET.
  try {
    await client.query("SET work_mem = '256MB'");
  } catch {
    console.warn("  could not raise work_mem — the join may spill to disk");
  }

  const keys = await client.query<{ n: string }>(DISTINCT_KEYS_SQL);
  const distinctKeys = Number(keys.rows[0]?.n ?? 0);

  let matched = 0;
  await client.query("BEGIN");
  try {
    // law_fines is fully derived from the parquet + laws, so rebuilding it
    // wholesale is safe. Inside the transaction, readers keep seeing the old
    // rows until COMMIT.
    await client.query("TRUNCATE TABLE law_fines RESTART IDENTITY");
    const inserted = await client.query(ATTACH_SQL);
    matched = inserted.rowCount ?? 0;
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }

  const amounts = await client.query<{ n: string }>(
    "SELECT count(*)::bigint AS n FROM law_fines WHERE effective_max IS NOT NULL",
  );

  // --- 3. Drop staging -----------------------------------------------------
  await client.query(`DROP TABLE IF EXISTS ${STAGING_TABLE}`);

  return {
    parquetRows,
    staged,
    distinctKeys,
    matched,
    withAmount: Number(amounts.rows[0]?.n ?? 0),
  };
}

// --- Standalone entrypoint -------------------------------------------------

export async function runFinesBuild(
  opts: BuildFinesOptions = {},
): Promise<FinesBuildStats> {
  loadEnv();
  const connectionString = opts.connectionString ?? connectionStringFromEnv();
  const client = new Client({ connectionString, connectionTimeoutMillis: 30_000 });
  client.on("error", (err) => {
    console.warn(`  pg client error: ${err.message}`);
  });
  await client.connect();
  const startedAt = Date.now();
  try {
    const stats = await buildFinesTable(client, { ...opts, connectionString });
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const rate = stats.distinctKeys
      ? ((stats.matched / stats.distinctKeys) * 100).toFixed(1)
      : "0.0";
    console.log(
      `law_fines: ${fmt(stats.matched)} rows in ${fmt(elapsed)}s ` +
        `(${fmt(stats.staged)} staged → ${fmt(stats.distinctKeys)} distinct keys, ` +
        `${rate}% attached)`,
    );
    console.log(`  with a dollar amount: ${fmt(stats.withAmount)}`);
    if (stats.matched < stats.distinctKeys) {
      console.log(
        `  ${fmt(stats.distinctKeys - stats.matched)} keys did not attach — sections ` +
          "whose text is not in this database. Expected on a sampled seed; " +
          "investigate if this is a full corpus.",
      );
    }
    return stats;
  } finally {
    await client.end();
  }
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (invokedDirectly()) {
  const restage = process.argv.slice(2).includes("--restage");
  runFinesBuild({ restage }).catch((err) => {
    console.error("\nFines build failed:", err);
    process.exitCode = 1;
  });
}
