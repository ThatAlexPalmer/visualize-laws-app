// LawFilters ↔ URLSearchParams. Pure: no React, no Prisma.
import {
  AXES,
  isPenaltyNature,
  isSortKey,
  type LawFilters,
} from "./types";

function parseFloatOrNull(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Normalize both HTTP and internal callers; every SQL offset stays a safe integer. */
export function normalizePagination(rawPage: unknown, rawSize: unknown) {
  const positive = (raw: unknown, fallback: number) => {
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? n : fallback;
  };
  const pageSize = Math.min(100, positive(rawSize, 25));
  const candidate = positive(rawPage, 1);
  const page = Number.isSafeInteger((candidate - 1) * pageSize) ? candidate : 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Serialize filters for GET /api/laws. Sort / dir only when `sort` is set. */
export function filtersToSearchParams(f: LawFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("page", String(f.page));
  p.set("pageSize", String(f.pageSize));
  if (f.q) p.set("q", f.q);
  if (f.state) p.set("state", f.state);
  if (f.city) p.set("city", f.city);
  if (f.county) p.set("county", f.county);
  if (f.function) p.set("function", f.function);
  if (f.topic) p.set("topic", f.topic);
  if (f.isSubstantive !== undefined) {
    p.set("isSubstantive", f.isSubstantive ? "true" : "false");
  }
  for (const a of AXES) {
    const r = f[a.key];
    if (!r) continue;
    if (Number.isFinite(r.min)) p.set(`${a.key}Min`, String(r.min));
    if (Number.isFinite(r.max)) p.set(`${a.key}Max`, String(r.max));
  }
  // Penalty flags: only "on" is meaningful, so false is not serialized.
  if (f.hasFine === true) p.set("hasFine", "true");
  if (f.perDay === true) p.set("perDay", "true");
  if (f.jail === true) p.set("jail", "true");
  if (f.fineMin !== undefined) p.set("fineMin", String(f.fineMin));
  if (f.fineMax !== undefined) p.set("fineMax", String(f.fineMax));
  if (f.penaltyNature && isPenaltyNature(f.penaltyNature)) {
    p.set("penaltyNature", f.penaltyNature);
  }
  if (f.sort && isSortKey(f.sort.key)) {
    p.set("sort", f.sort.key);
    p.set("dir", f.sort.dir);
  }
  return p;
}

/**
 * Parse GET /api/laws search params. Defaults: page 1, pageSize 25
 * (`queryLaws` used 25 when the query omitted pageSize; the store sends 8).
 */
export function searchParamsToFilters(sp: URLSearchParams): LawFilters {
  const { page, pageSize } = normalizePagination(sp.get("page"), sp.get("pageSize"));
  const filters: LawFilters = {
    page,
    pageSize,
  };

  const q = sp.get("q")?.trim();
  if (q) filters.q = q;

  const state = sp.get("state")?.trim();
  if (state) filters.state = state;

  const city = sp.get("city")?.trim();
  if (city) filters.city = city;

  const county = sp.get("county")?.trim();
  if (county) filters.county = county;

  const fn = sp.get("function")?.trim();
  if (fn) filters.function = fn;

  const topic = sp.get("topic")?.trim();
  if (topic) filters.topic = topic;

  const isSubstantive = sp.get("isSubstantive");
  if (isSubstantive === "true") filters.isSubstantive = true;
  else if (isSubstantive === "false") filters.isSubstantive = false;

  for (const axis of AXES) {
    const min = parseFloatOrNull(sp.get(`${axis.key}Min`));
    const max = parseFloatOrNull(sp.get(`${axis.key}Max`));
    if (min === null && max === null) continue;
    // A one-sided bound is still a filter. Missing side stays non-finite so
    // SQL does not invent a limit the URL did not send.
    filters[axis.key] = {
      min: min ?? Number.NEGATIVE_INFINITY,
      max: max ?? Number.POSITIVE_INFINITY,
    };
  }

  if (sp.get("hasFine") === "true") filters.hasFine = true;
  if (sp.get("perDay") === "true") filters.perDay = true;
  if (sp.get("jail") === "true") filters.jail = true;

  const fineMin = parseFloatOrNull(sp.get("fineMin"));
  if (fineMin !== null) filters.fineMin = fineMin;
  const fineMax = parseFloatOrNull(sp.get("fineMax"));
  if (fineMax !== null) filters.fineMax = fineMax;

  const nature = sp.get("penaltyNature")?.trim();
  if (nature && isPenaltyNature(nature)) filters.penaltyNature = nature;

  const rawSort = sp.get("sort");
  if (rawSort && isSortKey(rawSort)) {
    filters.sort = {
      key: rawSort,
      dir: sp.get("dir") === "asc" ? "asc" : "desc",
    };
  }

  return filters;
}

/** True when any LOCUS-Fines filter is active. */
export function hasPenaltyFilter(f: LawFilters): boolean {
  if (f.hasFine === true) return true;
  if (f.perDay === true) return true;
  if (f.jail === true) return true;
  if (f.fineMin !== undefined && Number.isFinite(f.fineMin)) return true;
  if (f.fineMax !== undefined && Number.isFinite(f.fineMax)) return true;
  return Boolean(f.penaltyNature && isPenaltyNature(f.penaltyNature));
}

/**
 * Saved `jurisdictions.law_count` is honest only when the query's WHERE is the
 * same scope the rail already counted: empty (US) or a single state predicate.
 * Extra fragments — or a row-only predicate such as fine sort — mean a
 * different set. Pass the WHERE `queryLaws` already built; do not re-list
 * filters here (a missed field would overstate the rail).
 */
export function shouldUseSavedScopeTotal(
  where: readonly string[],
  rowsWhere: readonly string[] = where,
): boolean {
  if (rowsWhere.length !== where.length) return false;
  if (where.length === 0) return true;
  return where.length === 1 && STATE_SCOPE_PREDICATE.test(where[0]);
}

const STATE_SCOPE_PREDICATE = /^laws\.state = \$\d+$/;
