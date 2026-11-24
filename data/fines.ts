/**
 * LOCUS-Fines supplement — pure helpers (no I/O).
 *
 * Only `annotation_source = 'LLM'` rows are stored. City and county are
 * normalized from NULL to '' here so `data/build-fines.ts` can hash-join them.
 * Dedupe is `DISTINCT ON` in that SQL, and the content fingerprint is
 * `substr(encode(digest(content, 'sha1'), 'hex'), 1, 16)` in Postgres.
 *
 * `STAGING_FIELDS` is the only column list. The COPY line, the staging table,
 * the attach INSERT, and the law-detail fines SELECT are all derived from it.
 */
import type { LawFines } from "./types";

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

type EncodeKind = "key" | "text" | "source" | "bool" | "tribool" | "num";

interface StagingField {
  column: keyof RawFineRow;
  sql: string;
  kind: EncodeKind;
  /**
   * `omit` stays on the staging key only (laws already has it).
   * `nullif` turns the '' join key back into NULL on `law_fines`.
   */
  attach: "copy" | "nullif" | "omit";
  api?: keyof LawFines;
  /** Stand-in when the detail SELECT's LEFT JOIN returns NULL. */
  missing?: null | false;
}

/**
 * Staging column order. The seven identity columns come first (stored
 * NULL-normalized to '' so the join is a plain hash equijoin), then the
 * annotation payload. COPY, CREATE, attach, and the detail SELECT follow
 * this array.
 */
const STAGING_FIELDS = [
  { column: "state", sql: "TEXT NOT NULL", kind: "key", attach: "copy" },
  { column: "source_jurisdiction_type", sql: "TEXT NOT NULL", kind: "key", attach: "omit" },
  { column: "city", sql: "TEXT NOT NULL", kind: "key", attach: "nullif" },
  { column: "county", sql: "TEXT NOT NULL", kind: "key", attach: "nullif" },
  { column: "function", sql: "TEXT NOT NULL", kind: "key", attach: "omit" },
  { column: "header", sql: "TEXT NOT NULL", kind: "key", attach: "omit" },
  { column: "content_sha1", sql: "TEXT NOT NULL", kind: "key", attach: "copy" },
  { column: "annotation_source", sql: "TEXT NOT NULL", kind: "source", attach: "copy" },
  { column: "fine_relevant", sql: "BOOLEAN NOT NULL", kind: "bool", attach: "copy", api: "fineRelevant", missing: null },
  { column: "penalty_scope", sql: "TEXT", kind: "text", attach: "copy", api: "penaltyScope", missing: null },
  { column: "penalty_stated", sql: "TEXT", kind: "text", attach: "copy", api: "penaltyStated", missing: null },
  { column: "fine_structure", sql: "TEXT", kind: "text", attach: "copy", api: "fineStructure", missing: null },
  { column: "fixed_amount", sql: "DOUBLE PRECISION", kind: "num", attach: "copy", api: "fixedAmount", missing: null },
  { column: "min_amount", sql: "DOUBLE PRECISION", kind: "num", attach: "copy", api: "minAmount", missing: null },
  { column: "max_amount", sql: "DOUBLE PRECISION", kind: "num", attach: "copy", api: "maxAmount", missing: null },
  { column: "first_violation_amount", sql: "DOUBLE PRECISION", kind: "num", attach: "copy", api: "firstViolationAmount", missing: null },
  { column: "second_violation_amount", sql: "DOUBLE PRECISION", kind: "num", attach: "copy", api: "secondViolationAmount", missing: null },
  { column: "subsequent_violation_amount", sql: "DOUBLE PRECISION", kind: "num", attach: "copy", api: "subsequentViolationAmount", missing: null },
  { column: "effective_min", sql: "DOUBLE PRECISION", kind: "num", attach: "copy", api: "effectiveMin", missing: null },
  { column: "effective_max", sql: "DOUBLE PRECISION", kind: "num", attach: "copy", api: "effectiveMax", missing: null },
  { column: "per_day_violation", sql: "BOOLEAN NOT NULL", kind: "bool", attach: "copy", api: "perDayViolation", missing: false },
  { column: "jail_mentioned", sql: "BOOLEAN NOT NULL", kind: "bool", attach: "copy", api: "jailMentioned", missing: false },
  { column: "penalty_nature", sql: "TEXT", kind: "text", attach: "copy", api: "penaltyNature", missing: null },
  { column: "extraction_flag", sql: "TEXT", kind: "text", attach: "copy", api: "extractionFlag", missing: null },
  { column: "grounded", sql: "BOOLEAN", kind: "tribool", attach: "copy", api: "grounded", missing: null },
] as const satisfies readonly StagingField[];

// A LawFines key missing from the table above fails this assignment.
type ListedApi = Extract<(typeof STAGING_FIELDS)[number], { api: keyof LawFines }>["api"];
type MissingFineField = Exclude<keyof LawFines, ListedApi>;
const everyFineFieldListed: MissingFineField extends never ? true : MissingFineField = true;
void everyFineFieldListed;

export const FINES_STAGING_COLUMNS = STAGING_FIELDS.map((field) => field.column);

/** The seven identity columns, in COPY order. */
export const FINES_IDENTITY_COLUMNS = STAGING_FIELDS.flatMap((field) =>
  field.kind === "key" ? [field.column] : [],
);

/** Law-detail columns. Same payload as staging, under the `LawFines` names. */
export const FINE_API_FIELDS = STAGING_FIELDS.flatMap((field) =>
  "api" in field
    ? [{ column: field.column, api: field.api, missing: field.missing }]
    : [],
);

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

function quoteIdent(column: string): string {
  return column === "function" ? '"function"' : column;
}

function encodeValue(kind: EncodeKind, value: unknown): string {
  switch (kind) {
    case "key":
      return copyText(toKey(value));
    case "source":
      // NOT NULL. A model row that forgot its source is still the LLM read.
      return copyText(toStr(value) ?? MODEL_ANNOTATION_SOURCE);
    case "text":
      return copyText(toStr(value));
    case "bool":
      return copyBool(toBool(value));
    case "tribool":
      return copyBool(toNullableBool(value));
    case "num":
      return copyNum(toNullableNum(value));
  }
}

/**
 * Render one supplement record as a COPY text-format line for the staging
 * table, in `FINES_STAGING_COLUMNS` order. Trailing newline included.
 */
export function encodeStagingRow(row: RawFineRow): string {
  return (
    STAGING_FIELDS.map((field) => encodeValue(field.kind, row[field.column])).join(
      "\t",
    ) + "\n"
  );
}

/** `CREATE UNLOGGED TABLE` for the staging load. `table` is a fixed identifier. */
export function createFinesStagingSql(table: string): string {
  const columns = STAGING_FIELDS.map(
    (field) => `${quoteIdent(field.column)} ${field.sql}`,
  ).join(",\n  ");
  return `CREATE UNLOGGED TABLE IF NOT EXISTS ${table} (
  row_no INTEGER PRIMARY KEY CHECK (row_no > 0),
  ${columns}
)`;
}

/** Insert list and SELECT list for `law_fines`, excluding staging-only key columns. */
export function finesAttachLists(): { insert: string; select: string } {
  const fields = STAGING_FIELDS.filter((field) => field.attach !== "omit");
  return {
    insert: fields.map((field) => field.column).join(", "),
    select: fields
      .map((field) => {
        const ident = `f.${quoteIdent(field.column)}`;
        return field.attach === "nullif" ? `NULLIF(${ident}, '')` : ident;
      })
      .join(",\n  "),
  };
}
