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

const PLACE_PREFIXES = [/^city_borough_of_/, /^municipality_of_/];
const PLACE_SUFFIXES = [
  /_county$/,
  /_parish$/,
  /_borough$/,
  /_census_area$/,
  /_city$/,
];

/**
 * Join key for LOCUS county slugs ↔ us-atlas county names.
 * Strips AK prefixes and county/parish/borough/census-area/`city` suffixes,
 * then compares lowercase words (underscores treated as spaces).
 */
export function normalizePlaceKey(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  for (const prefix of PLACE_PREFIXES) s = s.replace(prefix, "");
  for (const suffix of PLACE_SUFFIXES) s = s.replace(suffix, "");
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/** Resolve typed/clicked input to a stored LOCUS county slug, if any. */
export function matchCountySlug(
  counties: Array<{ county: string | null }>,
  input: string,
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const [a, b] = slugVariants(trimmed);
  const exact = counties.find((c) => {
    const slug = (c.county ?? "").toLowerCase();
    return slug === a || slug === b;
  });
  if (exact?.county) return exact.county;
  const needle = normalizePlaceKey(trimmed);
  if (!needle) return null;
  const fuzzy = counties.find(
    (c) => normalizePlaceKey(c.county ?? "") === needle,
  );
  return fuzzy?.county ?? null;
}
