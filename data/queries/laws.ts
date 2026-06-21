import { prisma } from "../db";
import {
  AXES,
  AXIS_BY_KEY,
  type Axis,
  type LawRecord,
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

// Columns we select, aliased to the camelCase shape of LawRecord.
const SELECT_COLUMNS = `
  id,
  header,
  content,
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

  const q = searchParams.get("q")?.trim();
  if (q) {
    where.push(`search_vector @@ websearch_to_tsquery('english', ${bind(q)})`);
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
  // secondary key on id so pagination is deterministic.
  const sortKey = searchParams.get("sort") as Axis | null;
  const sortMeta = sortKey ? AXIS_BY_KEY[sortKey] : undefined;
  const dir = searchParams.get("dir") === "asc" ? "ASC" : "DESC";
  const orderSql = sortMeta
    ? `ORDER BY ${sortMeta.column} ${dir}, id ASC`
    : `ORDER BY id ASC`;

  const rowsSql = `
    SELECT ${SELECT_COLUMNS}
    FROM laws
    ${whereSql}
    ${orderSql}
    LIMIT ${bind(pageSize)} OFFSET ${bind(offset)}
  `;
  const countSql = `SELECT count(*)::int AS total FROM laws ${whereSql}`;

  // rowsSql consumes the two extra LIMIT/OFFSET params; countSql only the WHERE
  // params, so slice them off.
  const countParams = params.slice(0, params.length - 2);

  try {
    const [rows, countRows] = await Promise.all([
      prisma.$queryRawUnsafe<LawRecord[]>(rowsSql, ...params),
      prisma.$queryRawUnsafe<{ total: number }[]>(countSql, ...countParams),
    ]);
    const total = countRows[0]?.total ?? 0;
    return { rows, total, page, pageSize };
  } catch (err) {
    console.error("queryLaws failed:", err);
    // Tolerate an empty / unavailable database.
    return { rows: [], total: 0, page, pageSize };
  }
}
