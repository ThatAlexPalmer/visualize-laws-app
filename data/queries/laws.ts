import { Prisma } from "@prisma/client";
import { normalizePagination } from "../filters";
import { prisma } from "../db";
import { FINE_API_FIELDS } from "../fines";
import { slugVariants } from "../slugs";
import {
  AXES,
  AXIS_BY_KEY,
  FINE_SORT_KEY,
  isPenaltyNature,
  isSortKey,
  type LawDetailResponse,
  type LawFilters,
  type LawFines,
  type LawRecord,
  type LawSummary,
  type LawsResponse,
  type SortKey,
} from "../types";

// Server-side filter / sort / pagination over the `laws` table.
//
// SECURITY: every user-supplied value is bound through a parameter placeholder
// ($1, $2, ...) — never string-interpolated. The only interpolated fragments are
// column names and the sort direction, which come from the trusted `AXES`
// constant and an asc/desc whitelist (Postgres cannot parameterize identifiers).

/** Escape LIKE metacharacters so slug underscores are literal. */
function escapeLike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Every predicate is qualified with `laws.`. The rows query LEFT JOINs
// law_fines, which carries its own state / city / county columns, so an
// unqualified reference is ambiguous and Postgres errors — which now fail
// the route rather than returning an empty 200.
const T = "laws";

/** ILIKE both slug variants so "Pagosa Springs" matches `pagosa_springs`. */
function placeIlikeSql(
  column: "city" | "county",
  raw: string,
  bind: (value: unknown) => string,
): string {
  const [a, b] = slugVariants(raw);
  const col = `${T}.${column}`;
  const likeA = bind(`%${escapeLike(a)}%`);
  if (a === b) return `${col} ILIKE ${likeA} ESCAPE '\\'`;
  return `(${col} ILIKE ${likeA} ESCAPE '\\' OR ${col} ILIKE ${bind(`%${escapeLike(b)}%`)} ESCAPE '\\')`;
}

/**
 * One EXISTS for every active penalty filter, or null when none are set.
 * One semi-join instead of one per flag. Values are bound; `penaltyNature`
 * is whitelisted against the source vocabulary.
 */
function penaltyExistsSql(
  filters: LawFilters,
  bind: (value: unknown) => string,
): string | null {
  const conds: string[] = [];

  if (filters.hasFine === true) {
    conds.push("lf.effective_max IS NOT NULL");
  }
  if (filters.perDay === true) {
    conds.push("lf.per_day_violation");
  }
  if (filters.jail === true) {
    conds.push("lf.jail_mentioned");
  }

  if (filters.fineMin !== undefined && Number.isFinite(filters.fineMin)) {
    conds.push(`lf.effective_max >= ${bind(filters.fineMin)}`);
  }
  if (filters.fineMax !== undefined && Number.isFinite(filters.fineMax)) {
    conds.push(`lf.effective_min <= ${bind(filters.fineMax)}`);
  }

  if (filters.penaltyNature && isPenaltyNature(filters.penaltyNature)) {
    conds.push(`lf.penalty_nature = ${bind(filters.penaltyNature)}`);
  }

  if (conds.length === 0) return null;
  return `EXISTS (SELECT 1 FROM law_fines lf WHERE lf.law_id = laws.id AND ${conds.join(" AND ")})`;
}

// --- Totals -----------------------------------------------------------------
//
// Bare US / state reuses `jurisdictions.law_count` (same number as the rail).
// Extra filters use explicitly labelled planner estimates, avoiding a full
// count on every page. Only the rows query's lookahead controls continuation.

/**
 * Pull the estimated row count from an `EXPLAIN (FORMAT JSON)` result. Postgres
 * returns `[{ "Plan": { "Plan Rows": N, ... } }]` in a single `QUERY PLAN`
 * column; Prisma hands JSON columns back already parsed, but we tolerate a
 * string too.
 */
function extractPlanRows(explainResult: unknown): number | null {
  if (!Array.isArray(explainResult) || explainResult.length === 0) return null;
  const row = explainResult[0];
  if (row === null || typeof row !== "object") return null;
  const planField = Object.values(row as Record<string, unknown>)[0];
  let parsed: unknown = planField;
  if (typeof planField === "string") {
    try {
      parsed = JSON.parse(planField);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const top = parsed[0] as { Plan?: { "Plan Rows"?: unknown } };
  const planRows = top?.Plan?.["Plan Rows"];
  return typeof planRows === "number" && Number.isSafeInteger(planRows) && planRows >= 0
    ? planRows
    : null;
}

/** Whole-table row estimate from catalog stats (a catalog lookup; no scan). */
async function estimateTotalFromCatalog(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ total: number | null }[]>(
      `SELECT reltuples::float8 AS total FROM pg_class WHERE oid = 'laws'::regclass`,
    );
    const total = rows[0]?.total;
    return typeof total === "number" && Number.isFinite(total) && total > 0 &&
      total <= Number.MAX_SAFE_INTEGER ? Math.round(total) : null;
  } catch {
    return null;
  }
}

/** Saved `jurisdictions.law_count` for the US or one state — same number the rail shows. */
async function savedScopeLawCount(state: string | null): Promise<number | null> {
  try {
    const row = await prisma.jurisdiction.findFirst({
      where: state ? { level: "state", state } : { level: "national" },
      select: { lawCount: true },
    });
    return row && Number.isSafeInteger(row.lawCount) && row.lawCount >= 0
      ? row.lawCount : null;
  } catch {
    return null;
  }
}

/**
 * Planner row estimate for the filtered query, via EXPLAIN. Without ANALYZE the
 * query is only planned, never executed. The SELECT list and ORDER BY do not
 * affect the row estimate, and LIMIT/OFFSET are intentionally omitted so we
 * estimate the full filtered set. `params` are bound exactly as for the rows
 * query. Estimates can still be very wrong and must not control pagination.
 */
async function estimateFilteredRows(
  whereSql: string,
  params: unknown[],
  fromSql = "laws",
): Promise<number | null> {
  try {
    const sql = `EXPLAIN (FORMAT JSON) SELECT 1 FROM ${fromSql} ${whereSql}`;
    const result = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      sql,
      ...params,
    );
    return extractPlanRows(result);
  } catch {
    return null;
  }
}

// One column list for the list query, the detail query, and the LawRecord.
// `content` is detail-only; `fine` is the joined effective_max, not a laws column.
const LAW_FIELDS = [
  ["id", "id"],
  ["header", "header"],
  ["is_substantive", "isSubstantive"],
  ["function", "function"],
  ["topic", "topic"],
  ["source_jurisdiction_type", "sourceJurisdictionType"],
  ["state", "state"],
  ["city", "city"],
  ["county", "county"],
  ["opacity", "opacity"],
  ["enforcement_discretion", "enforcementDiscretion"],
  ["paternalism", "paternalism"],
  ["problem_salience", "problemSalience"],
] as const satisfies ReadonlyArray<
  readonly [string, keyof Omit<LawRecord, "fine" | "content">]
>;

function lawSelect(alias: string): string {
  return LAW_FIELDS.map(([column, key]) => {
    const ident = column === "function" ? '"function"' : column;
    const qualified = `${alias}.${ident}`;
    return column === key ? qualified : `${qualified} AS "${key}"`;
  }).join(",\n  ");
}

// Full content stays off the list. The stated fine rides along so it stays
// visible on any map layer.
const SUMMARY_SELECT_COLUMNS = `${lawSelect("laws")},
  lfs.effective_max AS "fine"
`;

const DETAIL_SELECT_COLUMNS = `${lawSelect("l")},
  l.content
`;

// `missing` replaces SQL NULL. The two booleans are NOT NULL; false is only
// the stand-in if a driver still returns null. Column names live on
// `FINE_API_FIELDS`, the same list the fines importer COPYs.
const FINES_SELECT_COLUMNS = FINE_API_FIELDS.map(({ column, api }) => {
  const qualified = `f.${column}`;
  return column === api ? qualified : `${qualified} AS "${api}"`;
}).join(",\n  ");

/** Joined law plus a nullable fines annotation. Null means the LEFT JOIN missed. */
type LawDetailRow = Omit<LawRecord, "fine"> & {
  [K in keyof LawFines]: LawFines[K] | null;
};

function finesFromRow(row: LawDetailRow): LawFines | null {
  if (row.fineRelevant == null) return null;
  const fines = {} as LawFines;
  for (const { api, missing } of FINE_API_FIELDS) {
    (fines as unknown as Record<string, unknown>)[api] = row[api] ?? missing;
  }
  return fines;
}

type LawFieldKey = (typeof LAW_FIELDS)[number][1];

function lawFromRow(row: LawDetailRow): Pick<LawRecord, LawFieldKey> {
  const law = {} as Pick<LawRecord, LawFieldKey>;
  for (const [, key] of LAW_FIELDS) {
    (law as Record<string, unknown>)[key] = row[key];
  }
  return law;
}

/**
 * One law plus its LOCUS-Fines annotation, if the supplement's model read it.
 * A LEFT JOIN keeps the law available either way — an absent annotation is not
 * an error and must not be shown as "no penalty".
 */
export async function getLawById(id: number): Promise<LawDetailResponse | null> {
  const rows = await prisma.$queryRaw<LawDetailRow[]>`
    SELECT ${Prisma.raw(DETAIL_SELECT_COLUMNS)},
           ${Prisma.raw(FINES_SELECT_COLUMNS)}
    FROM laws l
    LEFT JOIN law_fines f ON f.law_id = l.id
    WHERE l.id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const law = {
    ...lawFromRow(row),
    content: row.content,
    // The list query selects this same amount as `fine`.
    fine: row.effectiveMax ?? null,
  };

  // `fine_relevant` is NOT NULL in law_fines, so a null here means the LEFT
  // JOIN found no annotation rather than an annotation that says false.
  return { law, fines: finesFromRow(row) };
}

/** Run a filtered/sorted/paginated query for laws from the LawFilters contract. */
export async function queryLaws(filters: LawFilters): Promise<LawsResponse> {
  const { page, pageSize, offset } = normalizePagination(filters.page, filters.pageSize);

  // Build the WHERE clause as parameterized fragments.
  const params: unknown[] = [];
  const where: string[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  // Full-text search. Capture the bound placeholder so the *same* query text can
  // drive both the WHERE match and the relevance ORDER BY (ts_rank_cd) below.
  // When q is set, also match city/county on the two lowercase slug variants
  // (spaces→underscores and spaces removed) so "Pagosa Springs" hits pagosa_springs.
  const q = filters.q?.trim();
  let qParam: string | null = null;
  let slugAParam: string | null = null;
  let slugBParam: string | null = null;
  if (q) {
    qParam = bind(q);
    const [slugA, slugB] = slugVariants(q);
    slugAParam = bind(slugA);
    slugBParam = slugA === slugB ? slugAParam : bind(slugB);
    where.push(
      `(${T}.search_vector @@ websearch_to_tsquery('english', ${qParam})` +
        ` OR ${T}.city IN (${slugAParam}, ${slugBParam})` +
        ` OR ${T}.county IN (${slugAParam}, ${slugBParam}))`,
    );
  }

  const state = filters.state?.trim();
  if (state) where.push(`${T}.state = ${bind(state.toLowerCase())}`);

  const city = filters.city?.trim();
  if (city) {
    const [a, b] = slugVariants(city);
    where.push(
      a === b
        ? `${T}.city IN (${bind(a)})`
        : `${T}.city IN (${bind(a)}, ${bind(b)})`,
    );
  }

  const county = filters.county?.trim();
  if (county) where.push(placeIlikeSql("county", county, bind));

  const fn = filters.function?.trim();
  if (fn) where.push(`${T}."function" = ${bind(fn)}`);

  const topic = filters.topic?.trim();
  if (topic) where.push(`${T}.topic = ${bind(topic)}`);

  if (filters.isSubstantive === true || filters.isSubstantive === false) {
    where.push(`${T}.is_substantive = ${bind(filters.isSubstantive)}`);
  }

  // Per-axis numeric range filters. Only finite bounds become SQL predicates
  // so a one-sided URL param does not invent the other side.
  for (const axis of AXES) {
    const r = filters[axis.key];
    if (!r) continue;
    if (Number.isFinite(r.min)) {
      where.push(`${T}.${axis.column} >= ${bind(r.min)}`);
    }
    if (Number.isFinite(r.max)) {
      where.push(`${T}.${axis.column} <= ${bind(r.max)}`);
    }
  }

  // LOCUS-Fines filters, as one semi-join against law_fines.
  const penaltySql = penaltyExistsSql(filters, bind);
  if (penaltySql) where.push(penaltySql);

  // The rows query always joins law_fines so the stated fine can ride along.
  const ROWS_FROM = "laws LEFT JOIN law_fines lfs ON lfs.law_id = laws.id";

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Sort: whitelist the key and direction. Always append a stable secondary
  // key on id so pagination is deterministic. When q is present, relevance
  // wins per the search contract; otherwise keep the existing sort/id ordering.
  const sortKey: SortKey | null =
    filters.sort && isSortKey(filters.sort.key) ? filters.sort.key : null;
  const sortByFine = sortKey === FINE_SORT_KEY;
  const dir = filters.sort?.dir === "asc" ? "ASC" : "DESC";

  // Sorting by fine only ranks laws that state one — there is nothing to order
  // the rest by. Requiring the amount also lets the planner walk
  // `law_fines_effective_max_idx` instead of sorting 2.2M rows.
  const rowsWhere = sortByFine
    ? [...where, "lfs.effective_max IS NOT NULL"]
    : where;
  const rowsWhereSql = rowsWhere.length
    ? `WHERE ${rowsWhere.join(" AND ")}`
    : "";

  let orderSql: string;
  if (qParam && slugAParam && slugBParam) {
    // IS TRUE so NULL city/county (the usual LOCUS shape) do not sort first
    // under DESC NULLS FIRST and bury the slug hits this clause exists to boost.
    orderSql =
      `ORDER BY ((laws.city IN (${slugAParam}, ${slugBParam}))` +
      ` OR (laws.county IN (${slugAParam}, ${slugBParam}))) IS TRUE DESC,` +
      ` ts_rank_cd(laws.search_vector, websearch_to_tsquery('english', ${qParam})) DESC, laws.id ASC`;
  } else if (sortByFine) {
    orderSql = `ORDER BY lfs.effective_max ${dir}, laws.id ASC`;
  } else if (sortKey) {
    orderSql = `ORDER BY laws.${AXIS_BY_KEY[sortKey].column} ${dir}, laws.id ASC`;
  } else {
    orderSql = `ORDER BY laws.id ASC`;
  }

  // The rows query appends its own LIMIT/OFFSET params after the WHERE params.
  const limitParam = `$${params.length + 1}`;
  const offsetParam = `$${params.length + 2}`;
  const rowsParams = [...params, pageSize + 1, offset];
  // LEFT JOIN, always: the stated fine rides along on every row so the results
  // list shows it on any layer. It cannot drop rows or fan out — law_fines is
  // unique on law_id.
  const rowsSql = `
    SELECT ${SUMMARY_SELECT_COLUMNS}
    FROM ${ROWS_FROM}
    ${rowsWhereSql}
    ${orderSql}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  // The rail's saved count is the whole corpus or one state. Any other
  // predicate, including a fine-sort row filter, is a different set.
  const useSaved =
    rowsWhere.length === where.length &&
    (where.length === 0 ||
      (where.length === 1 && /^laws\.state = \$\d+$/.test(where[0])));
  let usedSaved = false;
  const totalPromise = useSaved
    ? savedScopeLawCount(state ? state.toLowerCase() : null).then((saved) => {
        if (saved !== null) {
          usedSaved = true;
          return saved;
        }
        return where.length === 0
          ? estimateTotalFromCatalog().then(
              (t) => t ?? estimateFilteredRows("", []),
            )
          : estimateFilteredRows(whereSql, params);
      })
    : // The fine sort narrows to laws that state one, so the estimate has to
      // see the join and that predicate — otherwise it counts the whole corpus.
      estimateFilteredRows(
        rowsWhereSql,
        params,
        sortByFine ? ROWS_FROM : "laws",
      );

  const [fetched, counted] = await Promise.all([
    prisma.$queryRawUnsafe<LawSummary[]>(rowsSql, ...rowsParams),
    totalPromise,
  ]);

  const hasNextPage = fetched.length > pageSize;
  const rows = fetched.slice(0, pageSize).map((row) => ({
    ...row,
    fine: row.fine ?? null,
  }));
  const pagination = { rows, page, pageSize, hasNextPage };

  // A terminal page proves the total, even when it is exactly pageSize rows.
  // An empty page beyond page 1 proves only that its offset is past the end.
  if (!hasNextPage && (rows.length > 0 || offset === 0)) {
    return { ...pagination, total: offset + rows.length, totalKind: "exact" };
  }

  const observed = fetched.length > 0 ? offset + fetched.length : 0;
  if (usedSaved) {
    // Do not call a saved aggregate exact when the current rows contradict it.
    if (counted !== null && counted >= observed &&
        (rows.length > 0 || counted <= offset)) {
      return { ...pagination, total: counted, totalKind: "exact" };
    }
    return { ...pagination, total: null, totalKind: "unavailable" };
  }
  if (counted !== null) {
    return { ...pagination, total: Math.max(counted, observed), totalKind: "estimated" };
  }
  return { ...pagination, total: null, totalKind: "unavailable" };
}
