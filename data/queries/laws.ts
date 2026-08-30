import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { slugVariants } from "../slugs";
import {
  AXES,
  AXIS_BY_KEY,
  isPenaltyNature,
  type Axis,
  type LawFines,
  type LawRecord,
  type LawSummary,
  type LawsResponse,
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

/** ILIKE both slug variants so "Pagosa Springs" matches `pagosa_springs`. */
function placeIlikeSql(
  column: "city" | "county",
  raw: string,
  bind: (value: unknown) => string,
): string {
  const [a, b] = slugVariants(raw);
  const likeA = bind(`%${escapeLike(a)}%`);
  if (a === b) return `${column} ILIKE ${likeA} ESCAPE '\\'`;
  return `(${column} ILIKE ${likeA} ESCAPE '\\' OR ${column} ILIKE ${bind(`%${escapeLike(b)}%`)} ESCAPE '\\')`;
}

/** Equality on slug variants, not substring ILIKE. */
export function cityExactSql(
  raw: string,
  bind: (value: unknown) => string,
): string {
  const [a, b] = slugVariants(raw);
  if (a === b) return `city IN (${bind(a)})`;
  return `city IN (${bind(a)}, ${bind(b)})`;
}

function parseFloatOrNull(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Unfiltered US or a single state — the rail already shows `jurisdictions.law_count`.
 * Extra filters (q, city, county, function, topic, substantive, sliders) keep
 * the planner estimate. Sort / page do not count as extra filters.
 */
export function shouldUseSavedScopeTotal(searchParams: URLSearchParams): boolean {
  if (searchParams.get("q")?.trim()) return false;
  if (searchParams.get("city")?.trim()) return false;
  if (searchParams.get("county")?.trim()) return false;
  if (searchParams.get("function")?.trim()) return false;
  if (searchParams.get("topic")?.trim()) return false;
  const isSubstantive = searchParams.get("isSubstantive");
  if (isSubstantive === "true" || isSubstantive === "false") return false;
  for (const axis of AXES) {
    if (parseFloatOrNull(searchParams.get(`${axis.key}Min`)) !== null) return false;
    if (parseFloatOrNull(searchParams.get(`${axis.key}Max`)) !== null) return false;
  }
  // Any penalty filter narrows to the model-read subset, so the saved
  // jurisdiction total would badly overstate the result count.
  if (hasPenaltyFilter(searchParams)) return false;
  return true;
}

/** True when any LOCUS-Fines filter is active. */
export function hasPenaltyFilter(searchParams: URLSearchParams): boolean {
  if (searchParams.get("hasFine") === "true") return true;
  if (searchParams.get("perDay") === "true") return true;
  if (searchParams.get("jail") === "true") return true;
  if (parseFloatOrNull(searchParams.get("fineMin")) !== null) return true;
  if (parseFloatOrNull(searchParams.get("fineMax")) !== null) return true;
  const nature = searchParams.get("penaltyNature")?.trim();
  return Boolean(nature && isPenaltyNature(nature));
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
  searchParams: URLSearchParams,
  bind: (value: unknown) => string,
): string | null {
  const conds: string[] = [];

  if (searchParams.get("hasFine") === "true") {
    conds.push("lf.effective_max IS NOT NULL");
  }
  if (searchParams.get("perDay") === "true") {
    conds.push("lf.per_day_violation");
  }
  if (searchParams.get("jail") === "true") {
    conds.push("lf.jail_mentioned");
  }

  const min = parseFloatOrNull(searchParams.get("fineMin"));
  if (min !== null) conds.push(`lf.effective_max >= ${bind(min)}`);
  const max = parseFloatOrNull(searchParams.get("fineMax"));
  if (max !== null) conds.push(`lf.effective_min <= ${bind(max)}`);

  const nature = searchParams.get("penaltyNature")?.trim();
  if (nature && isPenaltyNature(nature)) {
    conds.push(`lf.penalty_nature = ${bind(nature)}`);
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
): Promise<number | null> {
  try {
    const sql = `EXPLAIN (FORMAT JSON) SELECT 1 FROM laws ${whereSql}`;
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
const SUMMARY_SELECT_COLUMNS = `
  id,
  header,
  is_substantive AS "isSubstantive",
  "function",
  topic,
  source_jurisdiction_type AS "sourceJurisdictionType",
  state,
  city,
  county,
  opacity,
  enforcement_discretion AS "enforcementDiscretion",
  paternalism,
  problem_salience AS "problemSalience"
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

type DetailRow = LawRecord & Partial<LawFines>;

/**
 * One law plus its LOCUS-Fines annotation, if the supplement's model read it.
 * A LEFT JOIN keeps the law available either way — an absent annotation is not
 * an error and must not be shown as "no penalty".
 */
export async function getLawById(id: number): Promise<LawDetail | null> {
  const rows = await prisma.$queryRaw<DetailRow[]>`
    SELECT ${Prisma.raw(DETAIL_SELECT_COLUMNS_QUALIFIED)},
           ${Prisma.raw(FINES_SELECT_COLUMNS)}
    FROM laws l
    LEFT JOIN law_fines f ON f.law_id = l.id
    WHERE l.id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const {
    fineRelevant,
    penaltyScope,
    penaltyStated,
    fineStructure,
    fixedAmount,
    minAmount,
    maxAmount,
    firstViolationAmount,
    secondViolationAmount,
    subsequentViolationAmount,
    effectiveMin,
    effectiveMax,
    perDayViolation,
    jailMentioned,
    penaltyNature,
    extractionFlag,
    grounded,
    ...law
  } = row;

  // `fine_relevant` is NOT NULL in law_fines, so a null here means the LEFT
  // JOIN found no annotation rather than an annotation that says false.
  const fines: LawFines | null =
    fineRelevant === null || fineRelevant === undefined
      ? null
      : {
          fineRelevant,
          penaltyScope: penaltyScope ?? null,
          penaltyStated: penaltyStated ?? null,
          fineStructure: fineStructure ?? null,
          fixedAmount: fixedAmount ?? null,
          minAmount: minAmount ?? null,
          maxAmount: maxAmount ?? null,
          firstViolationAmount: firstViolationAmount ?? null,
          secondViolationAmount: secondViolationAmount ?? null,
          subsequentViolationAmount: subsequentViolationAmount ?? null,
          effectiveMin: effectiveMin ?? null,
          effectiveMax: effectiveMax ?? null,
          perDayViolation: perDayViolation ?? false,
          jailMentioned: jailMentioned ?? false,
          penaltyNature: penaltyNature ?? null,
          extractionFlag: extractionFlag ?? null,
          grounded: grounded ?? null,
        };

  return { law: law as LawRecord, fines };
}

/** Run a filtered/sorted/paginated query for laws from URL search params. */
export async function queryLaws(
  searchParams: URLSearchParams,
): Promise<LawsResponse> {
  const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Math.floor(Number(searchParams.get("pageSize")) || 25)),
  );
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
  const q = searchParams.get("q")?.trim();
  let qParam: string | null = null;
  let slugAParam: string | null = null;
  let slugBParam: string | null = null;
  if (q) {
    qParam = bind(q);
    const [slugA, slugB] = slugVariants(q);
    slugAParam = bind(slugA);
    slugBParam = slugA === slugB ? slugAParam : bind(slugB);
    where.push(
      `(search_vector @@ websearch_to_tsquery('english', ${qParam})` +
        ` OR city IN (${slugAParam}, ${slugBParam})` +
        ` OR county IN (${slugAParam}, ${slugBParam}))`,
    );
  }

  const state = searchParams.get("state")?.trim();
  if (state) where.push(`state = ${bind(state.toLowerCase())}`);

  const city = searchParams.get("city")?.trim();
  if (city) where.push(cityExactSql(city, bind));

  const county = searchParams.get("county")?.trim();
  if (county) where.push(placeIlikeSql("county", county, bind));

  const fn = searchParams.get("function")?.trim();
  if (fn) where.push(`"function" = ${bind(fn)}`);

  const topic = searchParams.get("topic")?.trim();
  if (topic) where.push(`topic = ${bind(topic)}`);

  const isSubstantive = searchParams.get("isSubstantive");
  if (isSubstantive === "true" || isSubstantive === "false") {
    where.push(`is_substantive = ${bind(isSubstantive === "true")}`);
  }

  // Per-axis numeric range filters (e.g. opacityMin / opacityMax).
  for (const axis of AXES) {
    const min = parseFloatOrNull(searchParams.get(`${axis.key}Min`));
    const max = parseFloatOrNull(searchParams.get(`${axis.key}Max`));
    if (min !== null) where.push(`${axis.column} >= ${bind(min)}`);
    if (max !== null) where.push(`${axis.column} <= ${bind(max)}`);
  }

  // LOCUS-Fines filters, as one semi-join against law_fines.
  const penaltySql = penaltyExistsSql(searchParams, bind);
  if (penaltySql) where.push(penaltySql);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Sort: whitelist the column (from AXES) and direction. Always append a stable
  // secondary key on id so pagination is deterministic. When q is present,
  // relevance wins per the search contract; otherwise keep the existing sort/id
  // ordering.
  const sortKey = searchParams.get("sort") as Axis | null;
  const sortMeta = sortKey ? AXIS_BY_KEY[sortKey] : undefined;
  const dir = searchParams.get("dir") === "asc" ? "ASC" : "DESC";
  let orderSql: string;
  if (qParam && slugAParam && slugBParam) {
    // IS TRUE so NULL city/county (the usual LOCUS shape) do not sort first
    // under DESC NULLS FIRST and bury the slug hits this clause exists to boost.
    orderSql =
      `ORDER BY ((city IN (${slugAParam}, ${slugBParam}))` +
      ` OR (county IN (${slugAParam}, ${slugBParam}))) IS TRUE DESC,` +
      ` ts_rank_cd(search_vector, websearch_to_tsquery('english', ${qParam})) DESC, id ASC`;
  } else if (sortMeta) {
    orderSql = `ORDER BY ${sortMeta.column} ${dir}, id ASC`;
  } else {
    orderSql = `ORDER BY id ASC`;
  }

  // The rows query appends its own LIMIT/OFFSET params after the WHERE params.
  const limitParam = `$${params.length + 1}`;
  const offsetParam = `$${params.length + 2}`;
  const rowsParams = [...params, pageSize, offset];
  const rowsSql = `
    SELECT ${SUMMARY_SELECT_COLUMNS}
    FROM laws
    ${whereSql}
    ${orderSql}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  try {
    const useSaved = shouldUseSavedScopeTotal(searchParams);
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
      : estimateFilteredRows(whereSql, params);

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
  } catch (err) {
    console.error("queryLaws failed:", err);
    // Tolerate an empty / unavailable database.
    return { rows: [], total: 0, page, pageSize };
  }
}
