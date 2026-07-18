import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  AXES,
  AXIS_BY_KEY,
  type Axis,
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

function parseFloatOrNull(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// --- Approximate totals -----------------------------------------------------
//
// The pager only needs a row *count* to size itself; it does not need an exact
// value. An exact count(*) over the filtered 2.2M-row table costs hundreds of
// ms–seconds and runs on every page step, so instead we read the planner's
// estimate, which is effectively instant.

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

const DETAIL_SELECT_COLUMNS = `
  ${SUMMARY_SELECT_COLUMNS},
  content
`;

export async function getLawById(id: number): Promise<LawRecord | null> {
  const rows = await prisma.$queryRaw<LawRecord[]>`
    SELECT ${Prisma.raw(DETAIL_SELECT_COLUMNS)}
    FROM laws
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
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
  const q = searchParams.get("q")?.trim();
  let qParam: string | null = null;
  if (q) {
    qParam = bind(q);
    where.push(`search_vector @@ websearch_to_tsquery('english', ${qParam})`);
  }

  const state = searchParams.get("state")?.trim();
  if (state) where.push(`state = ${bind(state.toLowerCase())}`);

  const county = searchParams.get("county")?.trim();
  if (county) where.push(`county ILIKE ${bind(`%${county}%`)}`);

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

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Sort: whitelist the column (from AXES) and direction. Always append a stable
  // secondary key on id so pagination is deterministic. When q is present,
  // relevance wins per the search contract; otherwise keep the existing sort/id
  // ordering.
  const sortKey = searchParams.get("sort") as Axis | null;
  const sortMeta = sortKey ? AXIS_BY_KEY[sortKey] : undefined;
  const dir = searchParams.get("dir") === "asc" ? "ASC" : "DESC";
  let orderSql: string;
  if (qParam) {
    orderSql = `ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', ${qParam})) DESC, id ASC`;
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
    // `total` is an APPROXIMATE planner estimate, not an exact count(*):
    //   - No filters: the table's cached row estimate from pg_class.reltuples.
    //   - Filtered:   the planner's "Plan Rows" via EXPLAIN (FORMAT JSON).
    // Both are effectively instant and run in parallel with the rows query.
    const estimatePromise =
      where.length === 0
        ? estimateTotalFromCatalog().then(
            (t) => t ?? estimateFilteredRows("", []),
          )
        : estimateFilteredRows(whereSql, params);

    const [rows, estimate] = await Promise.all([
      prisma.$queryRawUnsafe<LawSummary[]>(rowsSql, ...rowsParams),
      estimatePromise,
    ]);

    // Never report fewer than the rows the caller can already see on this page.
    const floor = offset + rows.length;
    const total = Math.max(Math.round(estimate ?? 0), floor);
    return { rows, total, page, pageSize };
  } catch (err) {
    console.error("queryLaws failed:", err);
    // Tolerate an empty / unavailable database.
    return { rows: [], total: 0, page, pageSize };
  }
}
