import { prisma } from "../db";
import type {
  AxisBounds,
  JurisdictionDetailResponse,
  JurisdictionsResponse,
} from "../types";

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
 * The level='state' aggregate for `state`, plus a handful of representative
 * laws ordered by opacity (descending) for the jurisdiction detail panel.
 */
export async function getJurisdictionDetail(
  stateRaw: string,
): Promise<JurisdictionDetailResponse> {
  const code = stateRaw.toLowerCase();
  try {
    const [jurisdiction, topLaws] = await Promise.all([
      prisma.jurisdiction.findFirst({
        where: { level: "state", state: code },
        select: AGG_SELECT,
      }),
      prisma.law.findMany({
        where: { state: code },
        orderBy: { opacity: "desc" },
        take: 10,
        select: LAW_SELECT,
      }),
    ]);

    return { jurisdiction: jurisdiction ?? null, topLaws };
  } catch (err) {
    console.error(`getJurisdictionDetail(${code}) failed:`, err);
    return { jurisdiction: null, topLaws: [] };
  }
}
