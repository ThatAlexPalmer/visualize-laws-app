import type { PlaceMatch } from "@/lib/types";
import {
  loadCountyFeatures,
  matchAtlasCounties,
} from "@/components/map/counties";

export const MIN_PLACE_ZOOM_CHARS = 3;

export type PlaceFocus =
  | { kind: "county"; state: string; county: string }
  | { kind: "city"; state: string; city: string }
  | { kind: "atlas"; state: string; name: string };

export function pickPlace<T extends { state: string; lawCount: number }>(
  places: T[],
  currentState: string | null,
): T | null {
  if (places.length === 0) return null;
  if (currentState) {
    const here = places.find((p) => p.state === currentState);
    if (here) return here;
  }
  return places[0] ?? null;
}

/** True when the query is asking for a county, not a city of the same name. */
export function queryWantsCounty(q: string): boolean {
  return /(?:^|[\s_])(county|parish|borough)(?:$|[\s_])/.test(
    q.trim().toLowerCase().replace(/-/g, "_"),
  );
}

function toCountyFocus(row: PlaceMatch | null): PlaceFocus | null {
  if (!row?.county) return null;
  return { kind: "county", state: row.state, county: row.county };
}

function toCityFocus(row: PlaceMatch | null): PlaceFocus | null {
  if (!row?.city) return null;
  return { kind: "city", state: row.state, city: row.city };
}

/**
 * Prefer a city unless the query says county/parish/borough.
 * `uniqueOnly` still zooms when several states share one city name (Miami FL
 * vs OK) by taking the largest; it will not steal a city search for a
 * smaller same-named county (Miami County, KS).
 */
export async function resolveQueryFocus(
  q: string,
  opts: {
    currentState: string | null;
    uniqueOnly: boolean;
    signal?: AbortSignal;
  },
): Promise<PlaceFocus | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;

  const [counties, cities] = await Promise.all([
    lookupPlaces("county", trimmed, opts.signal),
    lookupPlaces("city", trimmed, opts.signal),
  ]);
  if (opts.signal?.aborted) return null;

  const wantCounty = queryWantsCounty(trimmed);
  const primary = wantCounty ? counties : cities;
  const secondary = wantCounty ? cities : counties;
  const toFocus = wantCounty ? toCountyFocus : toCityFocus;
  const toOther = wantCounty ? toCityFocus : toCountyFocus;

  if (opts.uniqueOnly) {
    if (primary.length === 1) return toFocus(primary[0]);
    if (primary.length > 1) {
      // Same place name in multiple states — pick the current state or the largest.
      return toFocus(pickPlace(primary, opts.currentState));
    }
    if (secondary.length === 1) return toOther(secondary[0]);
  } else {
    const first = toFocus(pickPlace(primary, opts.currentState));
    if (first) return first;
    const second = toOther(pickPlace(secondary, opts.currentState));
    if (second) return second;
  }

  if (primary.length > 0 || secondary.length > 0) return null;

  const atlas = matchAtlasCounties(await loadCountyFeatures(), trimmed);
  if (opts.signal?.aborted) return null;
  if (opts.uniqueOnly && atlas.length !== 1) return null;
  const here = opts.currentState
    ? atlas.find((m) => m.state === opts.currentState)
    : undefined;
  const atlasPick = here ?? atlas[0];
  return atlasPick
    ? { kind: "atlas", state: atlasPick.state, name: atlasPick.name }
    : null;
}

export async function lookupPlaces(
  kind: "city" | "county",
  q: string,
  signal?: AbortSignal,
): Promise<PlaceMatch[]> {
  const qs = new URLSearchParams({ [kind]: q });
  const response = await fetch(`/api/jurisdictions?${qs}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return [];
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("places" in body)) return [];
  const places = (body as { places: unknown }).places;
  if (!Array.isArray(places)) return [];
  return places.filter((row): row is PlaceMatch => {
    if (!row || typeof row !== "object") return false;
    const r = row as PlaceMatch;
    return typeof r.state === "string" && typeof r.lawCount === "number";
  });
}
