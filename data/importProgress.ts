import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Client } from "pg";

// All seed/build entrypoints use the same database-local session lock.
const WRITER_LOCK = 1279479637;

export class ImportStateError extends Error {}

export async function acquireWriter(client: Client): Promise<void> {
  const { rows } = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked", [WRITER_LOCK],
  );
  if (!rows[0]?.locked) {
    throw new ImportStateError("Another seed or derived-table builder owns this database.");
  }
}

export async function connectWriter(connectionString: string): Promise<Client> {
  const client = new Client({
    connectionString,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 45_000,
  });
  client.on("error", () => {
    // The awaited operation reports failure; do not log connection credentials.
  });
  try {
    await client.connect();
    await acquireWriter(client);
    await client.query("SET idle_in_transaction_session_timeout = 120000");
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

export async function fingerprintFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

/** Explicit --fresh only. Reset corpus and all progress/staging as one unit. */
export async function resetCorpus(client: Client): Promise<void> {
  await acquireWriter(client);
  await client.query("BEGIN");
  try {
    await client.query(
      "TRUNCATE TABLE laws, law_fines, place_penalties, jurisdictions, " +
      "seed_checkpoints, import_progress, city_county, county_fills RESTART IDENTITY",
    );
    await client.query("DROP TABLE IF EXISTS law_fines_import, law_fines_import_v2");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

export async function getProgress(
  client: Client, source: string, fingerprint: string,
): Promise<number> {
  const { rows } = await client.query<{ fingerprint: string; rows_loaded: number }>(
    "SELECT fingerprint, rows_loaded FROM import_progress WHERE source = $1", [source],
  );
  if (rows[0] && rows[0].fingerprint !== fingerprint) {
    throw new ImportStateError(`Source changed for ${source}; refusing to reuse its progress.`);
  }
  return rows[0]?.rows_loaded ?? 0;
}

/** Must be called inside the transaction that writes the corresponding rows. */
export async function saveProgress(
  client: Client, source: string, fingerprint: string, rows: number,
  complete = false,
): Promise<void> {
  await client.query(
    `INSERT INTO import_progress (source, fingerprint, rows_loaded, complete)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source) DO UPDATE SET
       rows_loaded = EXCLUDED.rows_loaded, complete = EXCLUDED.complete
     WHERE import_progress.fingerprint = EXCLUDED.fingerprint
     RETURNING source`,
    [source, fingerprint, rows, complete],
  ).then((result) => {
    if (result.rowCount !== 1) throw new ImportStateError(`Source changed for ${source}.`);
  });
}

/** Legacy completed counts plus atomic partial counts must explain all stored laws. */
export async function verifyCorpusProgress(client: Client): Promise<void> {
  const { rows } = await client.query<{ actual: string; accounted: string }>(`
    SELECT (SELECT count(*) FROM laws)::text AS actual,
      ((SELECT COALESCE(sum(rows_loaded), 0) FROM seed_checkpoints) +
       (SELECT COALESCE(sum(rows_loaded), 0) FROM import_progress
        WHERE source LIKE 'locus-v1/%' AND NOT complete))::text AS accounted
  `);
  if (rows[0].actual !== rows[0].accounted) {
    throw new ImportStateError(
      "Unverifiable partial corpus: database rows do not match import checkpoints. " +
      "Do not resume from seed-progress.json. Reconcile the import or explicitly reseed a disposable database.",
    );
  }
}
