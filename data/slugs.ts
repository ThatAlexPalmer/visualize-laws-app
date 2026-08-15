/**
 * LOCUS place slugs are lowercase (`pagosa_springs`, `el_paso_county`).
 * Search and sidebar filters accept human input and try two variants:
 *   spaces → underscores   ("Pagosa Springs" → pagosa_springs)
 *   spaces removed         ("King Cove" → kingcove)
 */

/** Lowercase slug variants of a query or filter string. */
export function slugVariants(raw: string): [string, string] {
  const lower = raw.trim().toLowerCase();
  return [lower.replace(/\s+/g, "_"), lower.replace(/\s+/g, "")];
}

/** `pagosa_springs` → `Pagosa Springs`. Safe on already-spaced input. */
export function prettySlug(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .replace(/_/g, " ")
    .replace(/\b([a-zA-Z])/g, (ch) => ch.toUpperCase());
}

const PLACE_PREFIXES = [
  /^city_and_borough_of_/,
  /^city_borough_of_/,
  /^municipality_of_/,
];
const PLACE_SUFFIXES = [
  /_county_*$/,
  /_parish_*$/,
  /_borough_*$/,
  /_census_area_*$/,
  /(county|parish|borough|census_area)_*$/,
];

/** True when a LOCUS slug is a county-type place (not an independent city). */
export function isCountyKindSlug(slug: string | null | undefined): boolean {
  return /(county|parish|borough|census_area)_*$/.test(
    (slug ?? "").trim().toLowerCase(),
  );
}

/**
 * Join key for LOCUS county slugs ↔ us-atlas county names.
 * Strips AK / borough prefixes and county/parish/borough/census-area suffixes
 * (with or without `_`, ignoring trailing `_`), drops punctuation, and treats
 * saint/ste as st so "St. Mary's" matches saint_mary's_county.
 */
export function normalizePlaceKey(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/_+$/g, "");
  for (const prefix of PLACE_PREFIXES) s = s.replace(prefix, "");
  for (const suffix of PLACE_SUFFIXES) s = s.replace(suffix, "");
  s = s
    .replace(/_/g, " ")
    .replace(/[.'’]/g, "")
    .replace(/\b(saint|ste)\b/g, "st");
  return s.replace(/\s+/g, " ").trim();
}

/** Resolve typed/clicked input to a stored LOCUS county slug, if any. */
export function matchCountySlug(
  counties: Array<{ county: string | null }>,
  input: string,
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const [a, b] = slugVariants(trimmed);
  const needle = normalizePlaceKey(trimmed);
  const candidates = counties.filter((c) => {
    const slug = (c.county ?? "").toLowerCase();
    return slug === a || slug === b || (needle && normalizePlaceKey(slug) === needle);
  });
  const preferred =
    candidates.find((c) => isCountyKindSlug(c.county)) ?? candidates[0];
  return preferred?.county ?? null;
}
