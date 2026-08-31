import { Prisma } from "@prisma/client";
import { hasPenaltyFilter, shouldUseSavedScopeTotal } from "../filters";
import { prisma } from "../db";
import { slugVariants } from "../slugs";
import {
  AXES,
  AXIS_BY_KEY,
  FINE_SORT_KEY,
  isPenaltyNature,
  isSortKey,
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

/** Equality on slug variants, not substring ILIKE. */
export function cityExactSql(
  raw: string,
  bind: (value: unknown) => string,
): string {
  const [a, b] = slugVariants(raw);
  if (a === b) return `${T}.city IN (${bind(a)})`;
  return `${T}.city IN (${bind(a)}, ${bind(b)})`;
}

/**
 * Build the `EXISTS (... law_fines ...)` predicate for the active penalty
 * filters, or null when none are set.
 *
 * All of them collapse into a single EXISTS so the planner does one
 * semi-join rather than one per filter. Every value is bound; `penaltyNature`
 * is additionally whitelisted against the source vocabulary.
 */
function penaltyExistsSql(
  filters: LawFilters,
  bind: (value: unknown) => string,
): string | null {
  if (!hasPenaltyFilter(filters)) return null;
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
// Extra filters still use a planner estimate: count(*) over 2.2M filtered rows
// is too expensive for every page step.

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
  return typeof planRows === "number" && Number.isFinite(planRows)
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
    return typeof total === "number" && total > 0 ? total : null;
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
    return row ? row.lawCount : null;
  } catch {
    return null;
  }
}

/**
 * Planner row estimate for the filtered query, via EXPLAIN. Without ANALYZE the
 * query is only planned, never executed. The SELECT list and ORDER BY do not
 * affect the row estimate, and LIMIT/OFFSET are intentionally omitted so we
 * estimate the full filtered set. `params` are bound exactly as for the rows
 * query, so the planner uses the real values for an accurate estimate.
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

// Summary columns returned by list endpoints. Full content is fetched only when
// a user opens a law, keeping filter/page responses small.
//
// Qualified with the `laws` alias throughout because the rows query always
// LEFT JOINs law_fines — the stated fine rides along on every list row so it
// stays visible regardless of which map layer is selected.
const SUMMARY_SELECT_COLUMNS = `
  laws.id,
  laws.header,
  laws.is_substantive AS "isSubstantive",
  laws."function",
  laws.topic,
  laws.source_jurisdiction_type AS "sourceJurisdictionType",
  laws.state,
  laws.city,
  laws.county,
  laws.opacity,
  laws.enforcement_discretion AS "enforcementDiscretion",
  laws.paternalism,
  laws.problem_salience AS "problemSalience",
  lfs.effective_max AS "fine"
`;

// The summary columns plus content, qualified with the `l` alias for the
// law_fines join.
// Spelled out rather than derived, so a change to the summary list is a
// deliberate edit here too.
const DETAIL_SELECT_COLUMNS_QUALIFIED = `
  l.id,
  l.header,
  l.is_substantive AS "isSubstantive",
  l."function",
  l.topic,
  l.source_jurisdiction_type AS "sourceJurisdictionType",
  l.state,
  l.city,
  l.county,
  l.opacity,
  l.enforcement_discretion AS "enforcementDiscretion",
  l.paternalism,
  l.problem_salience AS "problemSalience",
  l.content
`;

const FINES_SELECT_COLUMNS = `
  f.fine_relevant AS "fineRelevant",
  f.penalty_scope AS "penaltyScope",
  f.penalty_stated AS "penaltyStated",
  f.fine_structure AS "fineStructure",
  f.fixed_amount AS "fixedAmount",
  f.min_amount AS "minAmount",
  f.max_amount AS "maxAmount",
  f.first_violation_amount AS "firstViolationAmount",
  f.second_violation_amount AS "secondViolationAmount",
  f.subsequent_violation_amount AS "subsequentViolationAmount",
  f.effective_min AS "effectiveMin",
  f.effective_max AS "effectiveMax",
  f.per_day_violation AS "perDayViolation",
  f.jail_mentioned AS "jailMentioned",
  f.penalty_nature AS "penaltyNature",
  f.extraction_flag AS "extractionFlag",
  f.grounded
`;

export interface LawDetail {
  law: LawRecord;
  /** null when the supplement's model never read this law. */
  fines: LawFines | null;
}

/** Joined law + optional fines columns from the detail LEFT JOIN. */
interface LawDetailRow {
  id: number;
  header: string | null;
  isSubstantive: boolean;
  function: string | null;
  topic: string | null;
  sourceJurisdictionType: string | null;
  state: string;
  city: string | null;
  county: string | null;
  opacity: number;
  enforcementDiscretion: number;
  paternalism: number;
  problemSalience: number;
  content: string;
  fineRelevant: boolean | null;
  penaltyScope: string | null;
  penaltyStated: string | null;
  fineStructure: string | null;
  fixedAmount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  firstViolationAmount: number | null;
  secondViolationAmount: number | null;
  subsequentViolationAmount: number | null;
  effectiveMin: number | null;
  effectiveMax: number | null;
  perDayViolation: boolean | null;
  jailMentioned: boolean | null;
  penaltyNature: string | null;
  extractionFlag: string | null;
  grounded: boolean | null;
}

/**
 * One law plus its LOCUS-Fines annotation, if the supplement's model read it.
 * A LEFT JOIN keeps the law available either way — an absent annotation is not
 * an error and must not be shown as "no penalty".
 */
export async function getLawById(id: number): Promise<LawDetail | null> {
  const rows = await prisma.$queryRaw<LawDetailRow[]>`
    SELECT ${Prisma.raw(DETAIL_SELECT_COLUMNS_QUALIFIED)},
           ${Prisma.raw(FINES_SELECT_COLUMNS)}
    FROM laws l
    LEFT JOIN law_fines f ON f.law_id = l.id
    WHERE l.id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const law: LawRecord = {
    id: row.id,
    header: row.header,
    isSubstantive: row.isSubstantive,
    function: row.function,
    topic: row.topic,
    sourceJurisdictionType: row.sourceJurisdictionType,
    state: row.state,
    city: row.city,
    county: row.county,
    opacity: row.opacity,
    enforcementDiscretion: row.enforcementDiscretion,
    paternalism: row.paternalism,
    problemSalience: row.problemSalience,
    content: row.content,
  };

  // `fine_relevant` is NOT NULL in law_fines, so a null here means the LEFT
  // JOIN found no annotation rather than an annotation that says false.
  const fines: LawFines | null =
    row.fineRelevant === null || row.fineRelevant === undefined
      ? null
      : {
          fineRelevant: row.fineRelevant,
          penaltyScope: row.penaltyScope ?? null,
          penaltyStated: row.penaltyStated ?? null,
          fineStructure: row.fineStructure ?? null,
          fixedAmount: row.fixedAmount ?? null,
          minAmount: row.minAmount ?? null,
          maxAmount: row.maxAmount ?? null,
          firstViolationAmount: row.firstViolationAmount ?? null,
          secondViolationAmount: row.secondViolationAmount ?? null,
          subsequentViolationAmount: row.subsequentViolationAmount ?? null,
          effectiveMin: row.effectiveMin ?? null,
          effectiveMax: row.effectiveMax ?? null,
          perDayViolation: row.perDayViolation ?? false,
          jailMentioned: row.jailMentioned ?? false,
          penaltyNature: row.penaltyNature ?? null,
          extractionFlag: row.extractionFlag ?? null,
          grounded: row.grounded ?? null,
        };

  return { law, fines };
}

/** Run a filtered/sorted/paginated query for laws from the LawFilters contract. */
export async function queryLaws(filters: LawFilters): Promise<LawsResponse> {
  const page = Math.max(1, Math.floor(filters.page || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(filters.pageSize || 25)));
  const offset = (page - 1) * pageSize;

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
  if (city) where.push(cityExactSql(city, bind));

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
  const rowsParams = [...params, pageSize, offset];
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

  const useSaved = shouldUseSavedScopeTotal(filters);
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

  const [rows, counted] = await Promise.all([
    prisma.$queryRawUnsafe<LawSummary[]>(rowsSql, ...rowsParams),
    totalPromise,
  ]);

  if (usedSaved && counted !== null) {
    return { rows, total: counted, page, pageSize };
  }

  // Never report fewer than the rows the caller can already see on this page.
  const floor = offset + rows.length;
  const total = Math.max(Math.round(counted ?? 0), floor);
  return { rows, total, page, pageSize };
}
