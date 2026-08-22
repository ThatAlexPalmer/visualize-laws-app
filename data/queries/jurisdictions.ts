import { prisma } from "../db";
import { matchCountySlug, prettySlug, slugVariants } from "../slugs";
import type {
  AxisBounds,
  CityAgg,
  CountyFill,
  JurisdictionAgg,
  JurisdictionDetailResponse,
  JurisdictionsResponse,
  PlaceLookupResponse,
} from "../types";
import { nativeCountyToFill } from "../types";

// The columns that make up a JurisdictionAgg (excludes id + bounds).
const AGG_SELECT = {
  level: true,
  state: true,
  county: true,
  name: true,
  lawCount: true,
  substantiveCount: true,
  avgOpacity: true,
  avgEnforcementDiscretion: true,
  avgPaternalism: true,
  avgProblemSalience: true,
} as const;

const LAW_SELECT = {
  id: true,
  header: true,
  isSubstantive: true,
  function: true,
  topic: true,
  sourceJurisdictionType: true,
  state: true,
  city: true,
  county: true,
  opacity: true,
  enforcementDiscretion: true,
  paternalism: true,
  problemSalience: true,
} as const;

/**
 * All level='state' aggregates (for the choropleth + legend) plus the single
 * level='national' row, whose `bounds` JSON drives the color/slider domains.
 * County rows stay off this payload so the US map does not grow to ~3k rows.
 */
export async function getJurisdictions(): Promise<JurisdictionsResponse> {
  const [rows, nat] = await Promise.all([
    prisma.jurisdiction.findMany({
      where: { level: "state" },
      select: AGG_SELECT,
      orderBy: { name: "asc" },
    }),
    prisma.jurisdiction.findFirst({
      where: { level: "national" },
      select: { ...AGG_SELECT, bounds: true },
    }),
  ]);

  const national: JurisdictionsResponse["national"] = nat
    ? {
        ...nat,
        bounds: (nat.bounds as unknown as AxisBounds | undefined) ?? undefined,
      }
    : null;

  return { rows, national };
}

/**
 * Resolve a typed city or county to candidate (state, place) rows.
 * Used by GET /api/jurisdictions?city= / ?county= — not the US map payload.
 */
export async function resolvePlace(opts: {
  city?: string | null;
  county?: string | null;
}): Promise<PlaceLookupResponse> {
  const county = opts.county?.trim();
  const city = opts.city?.trim();

  if (county) {
    const rows = await prisma.jurisdiction.findMany({
      where: { level: "county" },
      select: AGG_SELECT,
    });
    const places = rows
      .filter((row) => matchCountySlug([row], county) === row.county)
      .sort((a, b) => b.lawCount - a.lawCount)
      .slice(0, 8)
      .flatMap((row) =>
        row.state && row.county
          ? [
              {
                state: row.state,
                county: row.county,
                name: row.name,
                lawCount: row.lawCount,
              },
            ]
          : [],
      );
    return { places };
  }

  if (city) {
    // Equality only — substring ILIKE made "la" jump to Los Angeles / Lafayette.
    const [slugA, slugB] = slugVariants(city);
    const rows = await prisma.$queryRaw<
      Array<{ state: string; city: string; lawCount: number }>
    >`
      SELECT state, city, count(*)::int AS "lawCount"
      FROM laws
      WHERE city IS NOT NULL AND city <> ''
        AND city IN (${slugA}, ${slugB})
      GROUP BY state, city
      ORDER BY count(*) DESC
      LIMIT 8
    `;
    return {
      places: rows.map((row) => ({
        state: row.state,
        city: row.city,
        name: prettySlug(row.city),
        lawCount: row.lawCount,
      })),
    };
  }

  return { places: [] };
}

async function queryTopCities(state: string): Promise<CityAgg[]> {
  return prisma.$queryRaw<CityAgg[]>`
    SELECT city, count(*)::int AS "lawCount"
    FROM laws
    WHERE state = ${state}
      AND city IS NOT NULL AND city <> ''
    GROUP BY city
    ORDER BY count(*) DESC
    LIMIT 12
  `;
}

/**
 * Per-state (or county-scoped) aggregate, top laws, in-state county rows, and
 * a short city list. Optional `county` switches the panel aggregate + top laws
 * to that county without a new REST resource.
 */
export async function getJurisdictionDetail(
  stateRaw: string,
  countyRaw?: string | null,
): Promise<JurisdictionDetailResponse> {
  const code = stateRaw.toLowerCase();
  try {
    const counties = await prisma.jurisdiction.findMany({
      where: { level: "county", state: code },
      select: AGG_SELECT,
      orderBy: { name: "asc" },
    });

    const countySlug = countyRaw?.trim()
      ? matchCountySlug(counties, countyRaw)
      : null;

    const [jurisdiction, topLaws, topCities, countyFills] = await Promise.all([
      countySlug
        ? Promise.resolve(
            counties.find((c) => c.county === countySlug) ?? null,
          )
        : prisma.jurisdiction.findFirst({
            where: { level: "state", state: code },
            select: AGG_SELECT,
          }),
      prisma.law.findMany({
        where: countySlug
          ? {
              state: code,
              county: { equals: countySlug, mode: "insensitive" },
            }
          : { state: code },
        orderBy: { opacity: "desc" },
        take: 10,
        select: LAW_SELECT,
      }),
      // Always state-level: LOCUS rows never set city and county together, so a
      // county-scoped city query would be empty and hide the city chips.
      queryTopCities(code),
      queryCountyFills(code, counties),
    ]);

    return {
      jurisdiction: jurisdiction ?? null,
      topLaws,
      counties,
      countyFills,
      topCities,
    };
  } catch (err) {
    console.error(`getJurisdictionDetail(${code}) failed:`, err);
    return {
      jurisdiction: null,
      topLaws: [],
      counties: [],
      countyFills: [],
      topCities: [],
    };
  }
}

async function queryCountyFills(
  state: string,
  nativeCounties: JurisdictionAgg[],
): Promise<CountyFill[]> {
  const stored = await prisma.countyFill.findMany({
    where: { state },
    select: {
      state: true,
      fips: true,
      source: true,
      sourcePlace: true,
      county: true,
      name: true,
      lawCount: true,
      substantiveCount: true,
      avgOpacity: true,
      avgEnforcementDiscretion: true,
      avgPaternalism: true,
      avgProblemSalience: true,
    },
    orderBy: { name: "asc" },
  });
  if (stored.length === 0) {
    return nativeCounties.map(nativeCountyToFill);
  }
  return stored.filter(
    (row): row is CountyFill =>
      row.source === "county" || row.source === "city",
  );
}
