import { STATE_NAMES, type PlaceFocus, type PlaceMatch } from "@/lib/types";
import {
  loadCountyFeatures,
  matchAtlasCounties,
} from "@/components/map/counties";

export const MIN_PLACE_ZOOM_CHARS = 3;

export type PlaceLookupOpts = {
  currentState: string | null;
  uniqueOnly: boolean;
  signal?: AbortSignal;
  /** Sidebar city/county field: search that kind first. Omits state-name match. */
  prefer?: "city" | "county";
};

/** Exact USPS code or full name. Prefixes (`col`) do not match. */
export function matchStateQuery(q: string): string | null {
  const t = q.trim().toLowerCase();
  if (!t) return null;
  if (t.length === 2 && STATE_NAMES[t]) return t;
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    if (name.toLowerCase() === t) return code;
  }
  return null;
}

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
 * Rank city/county hits. `undefined` means no hits — caller may try atlas.
 * `null` means hits existed but were not unique enough to zoom.
 */
export function pickFromPlaces(opts: {
  query: string;
  currentState: string | null;
  uniqueOnly: boolean;
  prefer?: "city" | "county";
  cities: PlaceMatch[];
  counties: PlaceMatch[];
}): PlaceFocus | null | undefined {
  const wantCounty =
    opts.prefer === "county" ||
    (opts.prefer !== "city" && queryWantsCounty(opts.query));
  const primary = wantCounty ? opts.counties : opts.cities;
  const secondary = wantCounty ? opts.cities : opts.counties;
  const toFocus = wantCounty ? toCountyFocus : toCityFocus;
  const toOther = wantCounty ? toCityFocus : toCountyFocus;

  if (opts.uniqueOnly) {
    if (primary.length === 1) return toFocus(primary[0]);
    if (primary.length > 1) {
      return toFocus(pickPlace(primary, opts.currentState));
    }
    if (secondary.length === 1) return toOther(secondary[0]);
    if (secondary.length > 0) return null;
    return undefined;
  }

  const first = toFocus(pickPlace(primary, opts.currentState));
  if (first) return first;
  const second = toOther(pickPlace(secondary, opts.currentState));
  if (second) return second;
  return undefined;
}

function pickFromAtlas(
  atlas: Array<{ state: string; name: string }>,
  opts: { currentState: string | null; uniqueOnly: boolean },
): PlaceFocus | null {
  if (opts.uniqueOnly && atlas.length !== 1) return null;
  const here = opts.currentState
    ? atlas.find((m) => m.state === opts.currentState)
    : undefined;
  const atlasPick = here ?? atlas[0];
  return atlasPick
    ? { kind: "atlas", state: atlasPick.state, name: atlasPick.name }
    : null;
}

/**
 * State name/code first (unless `prefer` is set). Then a city unless the
 * query says county/parish/borough (or `prefer` is county).
 * `uniqueOnly` still zooms when several states share a city name by taking
 * the current state or the largest.
 */
export async function resolveQueryFocus(
  q: string,
  opts: PlaceLookupOpts,
): Promise<PlaceFocus | null> {
  const trimmed = q.trim();
  if (!trimmed) return null;

  if (!opts.prefer) {
    const stateCode = matchStateQuery(trimmed);
    if (stateCode) return { kind: "state", state: stateCode };
  }

  const [counties, cities] = await Promise.all([
    lookupPlaces("county", trimmed, opts.signal),
    lookupPlaces("city", trimmed, opts.signal),
  ]);
  if (opts.signal?.aborted) return null;

  const fromPlaces = pickFromPlaces({
    query: trimmed,
    currentState: opts.currentState,
    uniqueOnly: opts.uniqueOnly,
    prefer: opts.prefer,
    cities,
    counties,
  });
  if (fromPlaces !== undefined) return fromPlaces;

  const atlas = matchAtlasCounties(await loadCountyFeatures(), trimmed);
  if (opts.signal?.aborted) return null;
  return pickFromAtlas(atlas, opts);
}

export async function lookupPlaces(
  kind: "city" | "county",
  q: string,
  signal?: AbortSignal,
): Promise<PlaceMatch[]> {
  const qs = new URLSearchParams({ [kind]: q });
  const response = await fetch(`/api/places?${qs}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    // HTTP failure is not "no match" — [] would zoom via atlas / skip as empty.
    throw new Error(`Place lookup failed with ${response.status}`);
  }
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
