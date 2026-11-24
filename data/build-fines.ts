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
 * Source fingerprint + committed progress are stored atomically with stable
 * model-row ordinals. Reruns reconcile the database checkpoint before replay.
 * UNLOGGED staging loss is detected and requires explicit --restage.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  asyncBufferFromFile,
  parquetMetadataAsync,
  parquetReadObjects,
} from "hyparquet";
import { Client } from "pg";

import {
  FINES_EXPECTED_ROWS,
  FINES_IDENTITY_COLUMNS,
  FINES_PARQUET_URL,
  FINES_STAGING_COLUMNS,
  createFinesStagingSql,
  encodeStagingRow,
  finesAttachLists,
  isModelAnnotated,
  type RawFineRow,
} from "./fines";
import { PENALTY_MEDIAN_MIN } from "./types";
import {
  acquireWriter, connectWriter, fingerprintFile, getProgress, saveProgress,
  withTransaction, ImportStateError,
} from "./importProgress";
import {
  LOAD_STATEMENT_TIMEOUT_MS,
  cacheDownload,
  copyBatch,
  loadEnv,
  writerConnectionString,
} from "./writer";

// --- Configuration ---------------------------------------------------------

const CACHE_DIR = resolve(process.cwd(), ".locus-cache");
const PARQUET_CACHE = resolve(CACHE_DIR, "locus-fines.parquet");

const STAGING_TABLE = "law_fines_import_v2";
const SOURCE = "locus-fines/model-rows-v1";
/** Parquet rows decoded per slice — bounds peak memory (~1.2 GB at 50k). */
const READ_CHUNK_ROWS = 50_000;
/** Matches the corpus seeder: a stalled remote COPY only loses this much. */
const COPY_BATCH_SIZE = 5_000;
const MAX_BATCH_ATTEMPTS = 8;
const RETRY_BACKOFF_MS = 2_000;
/** 0 = disabled. The join scans 2.2M rows and hashes every law body. */
const JOIN_STATEMENT_TIMEOUT_MS = 0;

const COPY_SQL = `COPY ${STAGING_TABLE} (row_no, ${FINES_STAGING_COLUMNS.map(
  (c) => `"${c}"`,
).join(", ")}) FROM STDIN`;

const IDENTITY_COLUMNS = FINES_IDENTITY_COLUMNS.map((column) => `"${column}"`).join(
  ", ",
);

const CREATE_STAGING_SQL = createFinesStagingSql(STAGING_TABLE);

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
const ATTACHED = finesAttachLists();

const ATTACH_SQL = `
INSERT INTO law_fines (
  law_id, ${ATTACHED.insert}
)
SELECT
  l.id,
  ${ATTACHED.select}
FROM (
  SELECT DISTINCT ON (${IDENTITY_COLUMNS}) *
  FROM ${STAGING_TABLE}
  ORDER BY ${IDENTITY_COLUMNS}, row_no
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
  GROUP BY ${IDENTITY_COLUMNS}
) t`;

/**
 * The aggregate expression list, shared by the place / state / national rows
 * so the three levels cannot drift apart.
 *
 * `median_fine` is suppressed below `medianMin` amount sections — a median off
 * three samples is noise, and 41 of 2,287 places are that thin.
 */
function penaltyAggColumns(medianMin: number): string {
  return `
    count(*)::int,
    count(*) FILTER (WHERE f.effective_max IS NOT NULL)::int,
    count(*) FILTER (WHERE f.jail_mentioned)::int,
    count(*) FILTER (WHERE f.per_day_violation)::int,
    CASE WHEN count(*) FILTER (WHERE f.effective_max IS NOT NULL) >= ${medianMin}
         THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY f.effective_max)
                FILTER (WHERE f.effective_max IS NOT NULL)
    END,
    CASE WHEN count(*) FILTER (WHERE f.effective_max IS NOT NULL) >= ${medianMin}
         THEN avg(l.problem_salience)
                FILTER (WHERE f.effective_max IS NOT NULL)
    END,
    CASE WHEN count(*) FILTER (WHERE f.effective_max IS NULL) >= ${medianMin}
         THEN avg(l.problem_salience)
                FILTER (WHERE f.effective_max IS NULL)
    END`;
}

/**
 * Per-place penalty aggregates for the map's Penalties layer.
 *
 * `place` is COALESCE(city, county) — mutually exclusive on a LOCUS row, and
 * exactly the value `county_fills.source_place` holds, so the map joins
 * straight onto (state, place).
 *
 * The colour metric (amount_sections / penalty_sections) is deliberately not
 * stored: deriving it at read time means the ratio can never drift from its
 * own numerator and denominator.
 */
function placePenaltiesSql(medianMin: number): string {
  const cols = penaltyAggColumns(medianMin);
  // Joined to `laws` for problem_salience. One pass over 632k rows against the
  // laws primary key — cheap next to the attach that precedes it.
  const from = "FROM law_fines f JOIN laws l ON l.id = f.law_id";
  return `
INSERT INTO place_penalties
  (level, state, place, penalty_sections, amount_sections,
   jail_sections, per_day_sections, median_fine,
   salience_amount, salience_no_amount)
SELECT 'place', f.state, COALESCE(f.city, f.county), ${cols}
${from}
WHERE COALESCE(f.city, f.county, '') <> ''
GROUP BY f.state, COALESCE(f.city, f.county)
UNION ALL
SELECT 'state', f.state, NULL, ${cols}
${from}
GROUP BY f.state
UNION ALL
SELECT 'national', NULL, NULL, ${cols}
${from}
`;
}

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
  /** `place_penalties` rows at level='place' (one per annotated place). */
  places: number;
}

// --- Helpers ---------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Download the supplement parquet into the cache if it is not already there. */
async function ensureParquet(): Promise<string> {
  if (existsSync(PARQUET_CACHE)) {
    console.log("  using cached locus-fines.parquet");
    return PARQUET_CACHE;
  }
  console.log(`  downloading ${FINES_PARQUET_URL}`);
  await cacheDownload(FINES_PARQUET_URL, PARQUET_CACHE);
  return PARQUET_CACHE;
}

// --- Build -----------------------------------------------------------------

export interface BuildFinesOptions {
  /** Overrides the env-derived URL for the standalone lock-owning session. */
  connectionString?: string;
  /** Discard any staging rows left by an earlier run instead of resuming. */
  restage?: boolean;
  /** Local source override for fixture tests; never supplied by the CLI. */
  file?: string;
}

/**
 * All writes use the lock-owning session. The caller closes it on failure and
 * retries the build on a new session, which reconciles committed progress.
 */
export async function buildFinesTable(
  client: Client,
  opts: BuildFinesOptions = {},
): Promise<FinesBuildStats> {
  await acquireWriter(client);
  const file = opts.file ?? await ensureParquet();
  const fingerprint = await fingerprintFile(file);

  await client.query(CREATE_STAGING_SQL);
  if (opts.restage) {
    console.log("  --restage: clearing staged rows");
    await withTransaction(client, async () => {
      await client.query(`TRUNCATE TABLE ${STAGING_TABLE}`);
      await client.query("DELETE FROM import_progress WHERE source = $1", [SOURCE]);
      await client.query("DROP TABLE IF EXISTS law_fines_import");
    });
  } else {
    const legacy = await client.query<{ present: boolean }>(
      "SELECT to_regclass('law_fines_import') IS NOT NULL AS present",
    );
    if (legacy.rows[0].present) {
      throw new ImportStateError("Legacy fines staging cannot be verified; use --restage.");
    }
  }

  const alreadyStaged = await getProgress(client, SOURCE, fingerprint);
  const staged0 = await client.query<{ n: number; last: number }>(
    `SELECT count(*)::int AS n, COALESCE(max(row_no), 0)::int AS last FROM ${STAGING_TABLE}`,
  );
  if (staged0.rows[0].n !== alreadyStaged || staged0.rows[0].last !== alreadyStaged) {
    throw new ImportStateError("Fines staging was lost or changed; use --restage.");
  }
  if (alreadyStaged > 0) {
    console.log(
      `  resuming — ${fmt(alreadyStaged)} model rows already staged`,
    );
  }

  // --- 1. Stream parquet -> staging ---------------------------------------
  await client.query(`SET statement_timeout = ${LOAD_STATEMENT_TIMEOUT_MS}`);
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
    await withTransaction(client, async () => {
      await copyBatch(client, COPY_SQL, batch);
      await saveProgress(client, SOURCE, fingerprint, staged + size);
    });
    staged += size;
    batch = [];
    if (staged % 100_000 < size) {
      console.log(`  staged ${fmt(staged)} model rows`);
    }
  };

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
      batch.push(`${modelRowsSeen}\t${encodeStagingRow(row)}`);
      if (batch.length >= COPY_BATCH_SIZE) await flush();
    }
  }
  await flush();
  if (modelRowsSeen !== staged) throw new ImportStateError("Fines source prefix is incomplete.");

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
  await withTransaction(client, async () => {
    // law_fines and place_penalties are both fully derived from the parquet +
    // laws. TRUNCATE is transactional but blocks readers until COMMIT.
    await client.query("TRUNCATE TABLE law_fines RESTART IDENTITY");
    const inserted = await client.query(ATTACH_SQL);
    matched = inserted.rowCount ?? 0;

    // --- 3. Per-place aggregates for the map's Penalties layer -------------
    await client.query("DELETE FROM place_penalties");
    await client.query(placePenaltiesSql(PENALTY_MEDIAN_MIN));
  });

  const summary = await client.query<{ amounts: string; places: string }>(`
    SELECT
      (SELECT count(*) FROM law_fines WHERE effective_max IS NOT NULL)::bigint
        AS amounts,
      (SELECT count(*) FROM place_penalties WHERE level = 'place')::bigint
        AS places
  `);

  // --- 4. Drop staging -----------------------------------------------------
  await withTransaction(client, async () => {
    await client.query(`DROP TABLE IF EXISTS ${STAGING_TABLE}`);
    await client.query("DELETE FROM import_progress WHERE source = $1", [SOURCE]);
  });

  return {
    parquetRows,
    staged,
    distinctKeys,
    matched,
    withAmount: Number(summary.rows[0]?.amounts ?? 0),
    places: Number(summary.rows[0]?.places ?? 0),
  };
}

// --- Standalone entrypoint -------------------------------------------------

export async function runFinesBuild(
  opts: BuildFinesOptions = {},
): Promise<FinesBuildStats> {
  loadEnv();
  const connectionString = opts.connectionString ?? writerConnectionString();
  let client = await connectWriter(connectionString);
  const startedAt = Date.now();
  try {
    let stats: FinesBuildStats | undefined;
    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
      try {
        stats = await buildFinesTable(client, {
          ...opts, restage: attempt === 1 && opts.restage,
        });
        break;
      } catch (error) {
        if (error instanceof ImportStateError || attempt === MAX_BATCH_ATTEMPTS) throw error;
        await client.end().catch(() => {});
        await sleep(RETRY_BACKOFF_MS * attempt);
        client = await connectWriter(connectionString);
      }
    }
    if (!stats) throw new Error("Fines build did not complete.");
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const rate = stats.distinctKeys
      ? ((stats.matched / stats.distinctKeys) * 100).toFixed(1)
      : "0.0";
    console.log(
      `law_fines: ${fmt(stats.matched)} rows in ${fmt(elapsed)}s ` +
        `(${fmt(stats.staged)} staged → ${fmt(stats.distinctKeys)} distinct keys, ` +
        `${rate}% attached)`,
    );
    console.log(
      `  with a dollar amount: ${fmt(stats.withAmount)} · ` +
        `${fmt(stats.places)} places aggregated`,
    );
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
