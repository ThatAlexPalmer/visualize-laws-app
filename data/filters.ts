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

const TEXT_FIELDS = ["q", "state", "city", "county", "function", "topic"] as const;

/** Only "on" is meaningful, so false is not serialized. */
const TRUE_FLAGS = ["hasFine", "perDay", "jail"] as const;

const NUMBER_FIELDS = ["fineMin", "fineMax"] as const;

/** Serialize filters for GET /api/laws. Sort / dir only when `sort` is set. */
export function filtersToSearchParams(f: LawFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("page", String(f.page));
  p.set("pageSize", String(f.pageSize));
  for (const key of TEXT_FIELDS) {
    const value = f[key];
    if (value) p.set(key, value);
  }
  if (f.isSubstantive !== undefined) {
    p.set("isSubstantive", f.isSubstantive ? "true" : "false");
  }
  for (const a of AXES) {
    const r = f[a.key];
    if (!r) continue;
    if (Number.isFinite(r.min)) p.set(`${a.key}Min`, String(r.min));
    if (Number.isFinite(r.max)) p.set(`${a.key}Max`, String(r.max));
  }
  for (const key of TRUE_FLAGS) {
    if (f[key] === true) p.set(key, "true");
  }
  for (const key of NUMBER_FIELDS) {
    const value = f[key];
    if (value !== undefined) p.set(key, String(value));
  }
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

  for (const key of TEXT_FIELDS) {
    const value = sp.get(key)?.trim();
    if (value) filters[key] = value;
  }

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

  for (const key of TRUE_FLAGS) {
    if (sp.get(key) === "true") filters[key] = true;
  }

  for (const key of NUMBER_FIELDS) {
    const value = parseFloatOrNull(sp.get(key));
    if (value !== null) filters[key] = value;
  }

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
