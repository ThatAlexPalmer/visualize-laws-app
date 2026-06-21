import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import type { AxisBounds, JurisdictionsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

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

// All level='state' aggregates (for the choropleth + legend) plus the single
// level='national' row, whose `bounds` JSON drives the color/slider domains.
export async function GET(): Promise<NextResponse<JurisdictionsResponse>> {
  try {
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
      ? { ...nat, bounds: (nat.bounds as unknown as AxisBounds | undefined) ?? undefined }
      : null;

    return NextResponse.json({ rows, national });
  } catch (err) {
    console.error("GET /api/jurisdictions failed:", err);
    // Tolerate an empty / unavailable database — the map renders outlines only.
    return NextResponse.json({ rows: [], national: null });
  }
}
