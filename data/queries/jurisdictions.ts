import { prisma } from "../db";
import { matchCountySlug, prettySlug, slugVariants } from "../slugs";
import type {
  AxisBounds,
  CityAgg,
  CountyFill,
  JurisdictionAgg,
  JurisdictionDetailResponse,
  JurisdictionsResponse,
  PenaltyStats,
  PlaceLookupResponse,
} from "../types";
import { nativeCountyToFill } from "../types";

const PENALTY_SELECT = {
  state: true,
  place: true,
  penaltySections: true,
  amountSections: true,
  jailSections: true,
  perDaySections: true,
  medianFine: true,
} as const;

function toStats(row: {
  penaltySections: number;
  amountSections: number;
  jailSections: number;
  perDaySections: number;
  medianFine: number | null;
}): PenaltyStats {
  return {
    penaltySections: row.penaltySections,
    amountSections: row.amountSections,
    jailSections: row.jailSections,
    perDaySections: row.perDaySections,
    medianFine: row.medianFine,
  };
}

/**
 * Penalty aggregates keyed by state code, for the US map payload.
 *
 * Missing rows are left undefined rather than zero-filled: a place the
 * supplement never annotated is "not annotated", which the map must render
 * differently from a place whose sections state no amount.
 */
async function penaltiesByState(): Promise<Map<string, PenaltyStats>> {
  try {
    const rows = await prisma.placePenalty.findMany({
      where: { level: "state" },
      select: PENALTY_SELECT,
    });
    return new Map(
      rows.flatMap((row) => (row.state ? [[row.state, toStats(row)] as const] : [])),
    );
  } catch (err) {
    // The layer is additive: an un-migrated database still renders the scores.
    console.error("penaltiesByState failed:", err);
    return new Map();
  }
}

/**
 * The single national penalty row, or null.
 *
 * Guarded like the others and never called inline inside a `Promise.all`
 * array: if the generated Prisma client predates the PlacePenalty model,
 * `prisma.placePenalty` is undefined and the property access throws
 * *synchronously*, before any `.catch()` can attach — which took the whole
 * map down rather than just dropping this layer.
 */
async function nationalPenalty(): Promise<PenaltyStats | null> {
  try {
    const row = await prisma.placePenalty.findFirst({
      where: { level: "national" },
      select: PENALTY_SELECT,
    });
    return row ? toStats(row) : null;
  } catch (err) {
    console.error("nationalPenalty failed:", err);
    return null;
  }
}

/** The one state-level penalty row, or null. Guarded like the rest. */
async function statePenaltyFor(state: string): Promise<PenaltyStats | null> {
  try {
    const row = await prisma.placePenalty.findFirst({
      where: { level: "state", state },
      select: PENALTY_SELECT,
    });
    return row ? toStats(row) : null;
  } catch (err) {
    console.error(`statePenaltyFor(${state}) failed:`, err);
    return null;
  }
}

/** Penalty aggregates for one state, keyed by place slug (`source_place`). */
async function penaltiesByPlace(state: string): Promise<Map<string, PenaltyStats>> {
  try {
    const rows = await prisma.placePenalty.findMany({
      where: { level: "place", state },
      select: PENALTY_SELECT,
    });
    return new Map(
      rows.flatMap((row) => (row.place ? [[row.place, toStats(row)] as const] : [])),
    );
  } catch (err) {
    console.error(`penaltiesByPlace(${state}) failed:`, err);
    return new Map();
  }
}

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
  // Scores first, on their own. The penalties layer is additive and must never
  // be able to blank the map: if it fails, the choropleth still renders.
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

  const [penalties, national] = await Promise.all([
    penaltiesByState(),
    nationalPenalty(),
  ]);

  return {
    rows: rows.map((row) => ({
      ...row,
      penalties: (row.state && penalties.get(row.state)) || null,
    })),
    national: nat
      ? {
          ...nat,
          bounds: (nat.bounds as unknown as AxisBounds | undefined) ?? undefined,
          penalties: national,
        }
      : null,
  };
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

    const placePenalties = await penaltiesByPlace(code);

    const [jurisdiction, topLaws, topCities, countyFills, statePenaltyStats] =
      await Promise.all([
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
      queryCountyFills(code, counties, placePenalties),
      statePenaltyFor(code),
    ]);

    // The panel aggregate is the county row when one is selected, otherwise
    // the state row; match the penalty stats to whichever it is.
    const panelPenalties = countySlug
      ? (placePenalties.get(countySlug) ?? null)
      : statePenaltyStats;

    return {
      jurisdiction: jurisdiction
        ? { ...jurisdiction, penalties: panelPenalties }
        : null,
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
  penalties: Map<string, PenaltyStats>,
): Promise<CountyFill[]> {
  try {
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
      return nativeCounties.map(nativeCountyToFill).map((fill) => ({
        ...fill,
        penalties: penalties.get(fill.sourcePlace) ?? null,
      }));
    }
    return stored
      .filter(
        (row): row is CountyFill =>
          row.source === "county" || row.source === "city",
      )
      .map((row) => ({
        // `source_place` is the city or county slug, which is exactly the key
        // place_penalties uses — no mapping needed.
        ...row,
        penalties: penalties.get(row.sourcePlace) ?? null,
      }));
  } catch (err) {
    console.error(`queryCountyFills(${state}) failed:`, err);
    return nativeCounties.map(nativeCountyToFill);
  }
}
