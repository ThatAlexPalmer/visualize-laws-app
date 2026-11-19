/**
 * LOCUS-Fines supplement — pure helpers (no I/O).
 *
 * Only `annotation_source = 'LLM'` rows are stored. City and county are
 * normalized from NULL to '' here so `data/build-fines.ts` can hash-join them.
 * Dedupe is `DISTINCT ON` in that SQL, and the content fingerprint is
 * `substr(encode(digest(content, 'sha1'), 'hex'), 1, 16)` in Postgres.
 */

/**
 * The supplement is one ~87 MB parquet on the auto-converted branch, matching
 * the URL shape `data/seed.ts` uses for the LOCUS-v1 shards.
 */
export const FINES_PARQUET_URL =
  "https://huggingface.co/datasets/LocalLaws/LOCUS-Fines/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet";

/** Published row count — used only as a sanity check in logs. */
export const FINES_EXPECTED_ROWS = 2_211_516;

/** `annotation_source` value for rows the model actually read. */
const MODEL_ANNOTATION_SOURCE = "LLM";

/**
 * Staging column order. The seven identity columns come first (stored
 * NULL-normalized to '' so the join is a plain hash equijoin), then the
 * annotation payload. `encodeStagingRow` emits values in exactly this order.
 */
export const FINES_STAGING_COLUMNS = [
  "state",
  "source_jurisdiction_type",
  "city",
  "county",
  "function",
  "header",
  "content_sha1",
  "annotation_source",
  "fine_relevant",
  "penalty_scope",
  "penalty_stated",
  "fine_structure",
  "fixed_amount",
  "min_amount",
  "max_amount",
  "first_violation_amount",
  "second_violation_amount",
  "subsequent_violation_amount",
  "effective_min",
  "effective_max",
  "per_day_violation",
  "jail_mentioned",
  "penalty_nature",
  "extraction_flag",
  "grounded",
] as const;

/** One raw record as handed back by the parquet reader. */
export interface RawFineRow {
  state?: unknown;
  source_jurisdiction_type?: unknown;
  city?: unknown;
  county?: unknown;
  function?: unknown;
  header?: unknown;
  content_sha1?: unknown;
  annotation_source?: unknown;
  fine_relevant?: unknown;
  penalty_scope?: unknown;
  penalty_stated?: unknown;
  fine_structure?: unknown;
  fixed_amount?: unknown;
  min_amount?: unknown;
  max_amount?: unknown;
  first_violation_amount?: unknown;
  second_violation_amount?: unknown;
  subsequent_violation_amount?: unknown;
  effective_min?: unknown;
  effective_max?: unknown;
  per_day_violation?: unknown;
  jail_mentioned?: unknown;
  penalty_nature?: unknown;
  extraction_flag?: unknown;
  grounded?: unknown;
}

// --- Coercion --------------------------------------------------------------

/** Parquet strings arrive as string | Buffer | Uint8Array depending on codec. */
export function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  return String(value);
}

/** Identity-column value: never null, so the join key is a plain equality. */
function toKey(value: unknown): string {
  return toStr(value) ?? "";
}

/** Nullable dollar amount. Non-finite values are dropped rather than stored. */
function toNullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.toLowerCase();
    return v === "true" || v === "t" || v === "1";
  }
  return Boolean(value);
}

/** `grounded` is genuinely tri-state: true / false / null on rule-derived rows. */
function toNullableBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return toBool(value);
}

/** True when the supplement's model read this row (vs. rule-derived). */
export function isModelAnnotated(row: RawFineRow): boolean {
  return toStr(row.annotation_source) === MODEL_ANNOTATION_SOURCE;
}

// --- Postgres COPY text format ---------------------------------------------

/** Escape a value for the COPY *text* format (tab-delimited, `\N` = null). */
export function copyText(value: string | null): string {
  if (value === null) return "\\N";
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function copyBool(value: boolean | null): string {
  if (value === null) return "\\N";
  return value ? "t" : "f";
}

function copyNum(value: number | null): string {
  return value === null ? "\\N" : String(value);
}

/**
 * Render one supplement record as a COPY text-format line for the staging
 * table, in `FINES_STAGING_COLUMNS` order. Trailing newline included.
 */
export function encodeStagingRow(row: RawFineRow): string {
  return (
    [
      copyText(toKey(row.state)),
      copyText(toKey(row.source_jurisdiction_type)),
      copyText(toKey(row.city)),
      copyText(toKey(row.county)),
      copyText(toKey(row.function)),
      copyText(toKey(row.header)),
      copyText(toKey(row.content_sha1)),
      copyText(toStr(row.annotation_source) ?? MODEL_ANNOTATION_SOURCE),
      copyBool(toBool(row.fine_relevant)),
      copyText(toStr(row.penalty_scope)),
      copyText(toStr(row.penalty_stated)),
      copyText(toStr(row.fine_structure)),
      copyNum(toNullableNum(row.fixed_amount)),
      copyNum(toNullableNum(row.min_amount)),
      copyNum(toNullableNum(row.max_amount)),
      copyNum(toNullableNum(row.first_violation_amount)),
      copyNum(toNullableNum(row.second_violation_amount)),
      copyNum(toNullableNum(row.subsequent_violation_amount)),
      copyNum(toNullableNum(row.effective_min)),
      copyNum(toNullableNum(row.effective_max)),
      copyBool(toBool(row.per_day_violation)),
      copyBool(toBool(row.jail_mentioned)),
      copyText(toStr(row.penalty_nature)),
      copyText(toStr(row.extraction_flag)),
      copyBool(toNullableBool(row.grounded)),
    ].join("\t") + "\n"
  );
}
