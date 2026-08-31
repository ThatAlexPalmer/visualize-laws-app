// LawFilters ↔ URLSearchParams. Pure: no React, no Prisma.
import {
  AXES,
  FINE_SORT_KEY,
  isPenaltyNature,
  isSortKey,
  type LawFilters,
} from "./types";

function parseFloatOrNull(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parsePage(raw: string | null, fallback: number): number {
  return Math.max(1, Math.floor(Number(raw) || fallback));
}

function parsePageSize(raw: string | null, fallback: number): number {
  return Math.min(100, Math.max(1, Math.floor(Number(raw) || fallback)));
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
  const filters: LawFilters = {
    page: parsePage(sp.get("page"), 1),
    pageSize: parsePageSize(sp.get("pageSize"), 25),
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
 * Unfiltered US or a single state — the rail already shows `jurisdictions.law_count`.
 * Extra filters (q, city, county, function, topic, substantive, sliders, penalties)
 * keep the planner estimate. Sort / page do not count as extra filters, except
 * sorting by fine, which restricts to laws that state one.
 */
export function shouldUseSavedScopeTotal(f: LawFilters): boolean {
  if (f.sort?.key === FINE_SORT_KEY) return false;
  if (f.q?.trim()) return false;
  if (f.city?.trim()) return false;
  if (f.county?.trim()) return false;
  if (f.function?.trim()) return false;
  if (f.topic?.trim()) return false;
  if (f.isSubstantive === true || f.isSubstantive === false) return false;
  for (const axis of AXES) {
    const r = f[axis.key];
    if (!r) continue;
    if (Number.isFinite(r.min) || Number.isFinite(r.max)) return false;
  }
  if (hasPenaltyFilter(f)) return false;
  return true;
}
