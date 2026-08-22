/**
 * Census 2020 place ↔ LOCUS city join. Used by the city_county builder.
 * No hand concordance: unmatched townships / New England towns stay unmatched.
 */
import { normalizePlaceKey } from "./slugs";

export const CENSUS_PLACE_URL =
  "https://www2.census.gov/geo/docs/reference/codes2020/national_place2020.txt";
export const CENSUS_COUNTY_URL =
  "https://www2.census.gov/geo/docs/reference/codes2020/national_county2020.txt";

/** One legal suffix stripped from Census place names. */
export const PLACE_LEGAL_SUFFIXES = [
  "city",
  "town",
  "village",
  "borough",
  "cdp",
  "municipality",
] as const;

export type CityMatchRule = "exact" | "concat" | "multi" | "unmatched";

export interface CensusPlace {
  state: string;
  placeName: string;
  counties: string[];
}

export interface CensusCounty {
  state: string;
  fips: string;
  name: string;
}

export interface CityCountyMatch {
  state: string;
  city: string;
  countyFips: string | null;
  countyName: string | null;
  atlasKey: string | null;
  matchRule: CityMatchRule;
  multiCounty: boolean;
  countyCount: number;
}

const SUFFIX_RE = new RegExp(
  `\\s+(${PLACE_LEGAL_SUFFIXES.join("|")})$`,
  "i",
);

/** Lower, saint/ste → st, punctuation dropped, spaces/hyphens → underscore. */
export function cityMatchKeys(raw: string): { underscore: string; concat: string } {
  const underscore = raw
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[-\s_]+/g, " ")
    .replace(/\b(saint|ste)\b/g, "st")
    .trim()
    .replace(/\s+/g, "_");
  return { underscore, concat: underscore.replace(/_/g, "") };
}

export function stripPlaceLegalSuffix(name: string): string {
  return name.trim().replace(SUFFIX_RE, "").trim();
}

function parseDelimited(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    rows.push(line.split("|"));
  }
  return rows;
}

export function parsePlaceFile(text: string): CensusPlace[] {
  const rows = parseDelimited(text);
  const header = rows[0] ?? [];
  const iState = header.indexOf("STATE");
  const iName = header.indexOf("PLACENAME");
  const iCounties = header.indexOf("COUNTIES");
  if (iState < 0 || iName < 0 || iCounties < 0) {
    throw new Error("national_place2020.txt: missing STATE/PLACENAME/COUNTIES");
  }
  const out: CensusPlace[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const state = (cols[iState] ?? "").trim().toLowerCase();
    const placeName = (cols[iName] ?? "").trim();
    const rawCounties = (cols[iCounties] ?? "").trim();
    if (!state || !placeName) continue;
    const counties = rawCounties
      ? rawCounties.split("~~~").map((c) => c.trim()).filter(Boolean)
      : [];
    out.push({ state, placeName, counties });
  }
  return out;
}

export function parseCountyFile(text: string): CensusCounty[] {
  const rows = parseDelimited(text);
  const header = rows[0] ?? [];
  const iState = header.indexOf("STATE");
  const iStateFp = header.indexOf("STATEFP");
  const iCountyFp = header.indexOf("COUNTYFP");
  const iName = header.indexOf("COUNTYNAME");
  if (iState < 0 || iStateFp < 0 || iCountyFp < 0 || iName < 0) {
    throw new Error(
      "national_county2020.txt: missing STATE/STATEFP/COUNTYFP/COUNTYNAME",
    );
  }
  const out: CensusCounty[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const state = (cols[iState] ?? "").trim().toLowerCase();
    const stateFp = (cols[iStateFp] ?? "").trim().padStart(2, "0");
    const countyFp = (cols[iCountyFp] ?? "").trim().padStart(3, "0");
    const name = (cols[iName] ?? "").trim();
    if (!state || !name) continue;
    out.push({ state, fips: `${stateFp}${countyFp}`, name });
  }
  return out;
}

export function indexCountiesByKey(
  counties: CensusCounty[],
): Map<string, CensusCounty[]> {
  const index = new Map<string, CensusCounty[]>();
  const remember = (state: string, key: string, row: CensusCounty): void => {
    if (!key) return;
    const id = `${state}|${key}`;
    const list = index.get(id);
    if (list) list.push(row);
    else index.set(id, [row]);
  };
  for (const row of counties) {
    const key = normalizePlaceKey(row.name);
    remember(row.state, key, row);
    remember(row.state, key.replace(/\s+/g, ""), row);
  }
  return index;
}

/** Resolve a Census county name in a state to one FIPS, or null if ambiguous. */
export function resolveCountyFips(
  state: string,
  countyName: string,
  byKey: Map<string, CensusCounty[]>,
): CensusCounty | null {
  const key = normalizePlaceKey(countyName);
  if (!key) return null;
  const hits =
    byKey.get(`${state}|${key}`) ??
    byKey.get(`${state}|${key.replace(/\s+/g, "")}`) ??
    [];
  const unique = new Map<string, CensusCounty>();
  for (const row of hits) unique.set(row.fips, row);
  if (unique.size !== 1) return null;
  return [...unique.values()][0] ?? null;
}

function rememberPlace(
  index: Map<string, CensusPlace[]>,
  state: string,
  key: string,
  place: CensusPlace,
): void {
  if (!key) return;
  const id = `${state}|${key}`;
  const list = index.get(id);
  if (list) {
    if (!list.includes(place)) list.push(place);
  } else {
    index.set(id, [place]);
  }
}

function indexPlacesByKey(places: CensusPlace[]): {
  byUnderscore: Map<string, CensusPlace[]>;
  byConcat: Map<string, CensusPlace[]>;
} {
  const byUnderscore = new Map<string, CensusPlace[]>();
  const byConcat = new Map<string, CensusPlace[]>();
  for (const place of places) {
    const stripped = stripPlaceLegalSuffix(place.placeName);
    const keys = cityMatchKeys(stripped);
    rememberPlace(byUnderscore, place.state, keys.underscore, place);
    if (keys.concat !== keys.underscore) {
      rememberPlace(byConcat, place.state, keys.concat, place);
    }
  }
  return { byUnderscore, byConcat };
}

function sameSingleCounty(places: CensusPlace[]): string | null {
  let county: string | null = null;
  for (const place of places) {
    if (place.counties.length !== 1) return null;
    const name = place.counties[0] ?? "";
    if (!county) county = name;
    else if (county !== name) return null;
  }
  return county;
}

export function matchLocusCities(
  cities: Array<{ state: string; city: string }>,
  places: CensusPlace[],
  counties: CensusCounty[],
): CityCountyMatch[] {
  const { byUnderscore, byConcat } = indexPlacesByKey(places);
  const countyIndex = indexCountiesByKey(counties);

  return cities.map(({ state, city }) => {
    const keys = cityMatchKeys(city);
    const exact = byUnderscore.get(`${state}|${keys.underscore}`) ?? [];
    const concat = keys.concat
      ? (byConcat.get(`${state}|${keys.concat}`) ??
        byUnderscore.get(`${state}|${keys.concat}`) ??
        [])
      : [];
    const usedExact = exact.length > 0;
    const hits = usedExact ? exact : concat;

    const unmatched = (): CityCountyMatch => ({
      state,
      city,
      countyFips: null,
      countyName: null,
      atlasKey: null,
      matchRule: "unmatched",
      multiCounty: false,
      countyCount: 0,
    });

    if (hits.length === 0) return unmatched();

    const uniquePlaces: CensusPlace[] = [];
    const seen = new Set<string>();
    for (const place of hits) {
      const id = `${place.placeName}|${place.counties.join("~")}`;
      if (seen.has(id)) continue;
      seen.add(id);
      uniquePlaces.push(place);
    }

    const multi = uniquePlaces.some((p) => p.counties.length > 1);
    if (multi || uniquePlaces.some((p) => p.counties.length === 0)) {
      const names = uniquePlaces.flatMap((p) => p.counties);
      return {
        state,
        city,
        countyFips: null,
        countyName: names[0] ?? null,
        atlasKey: names[0] ? normalizePlaceKey(names[0]) : null,
        matchRule: "multi",
        multiCounty: true,
        countyCount: new Set(names).size,
      };
    }

    const countyName = sameSingleCounty(uniquePlaces);
    if (!countyName) return unmatched();

    const resolved = resolveCountyFips(state, countyName, countyIndex);
    return {
      state,
      city,
      countyFips: resolved?.fips ?? null,
      countyName,
      atlasKey: normalizePlaceKey(countyName) || null,
      matchRule: usedExact ? "exact" : "concat",
      multiCounty: false,
      countyCount: 1,
    };
  });
}

/** Attach a Census FIPS to a LOCUS county slug when exactly one county matches. */
export function resolveNativeCountyFips(
  state: string,
  countySlug: string,
  byKey: Map<string, CensusCounty[]>,
): CensusCounty | null {
  const key = normalizePlaceKey(countySlug);
  if (!key) return null;
  return resolveCountyFips(state, countySlug, byKey) ??
    resolveCountyFips(state, key, byKey);
}
