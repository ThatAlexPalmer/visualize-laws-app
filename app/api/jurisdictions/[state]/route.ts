import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import type { JurisdictionDetailResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

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
  content: true,
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

// The level='state' aggregate for `state`, plus a handful of representative
// laws ordered by opacity (descending) for the jurisdiction detail panel.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ state: string }> },
): Promise<NextResponse<JurisdictionDetailResponse>> {
  const { state } = await params;
  const code = state.toLowerCase();
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

    return NextResponse.json({ jurisdiction: jurisdiction ?? null, topLaws });
  } catch (err) {
    console.error(`GET /api/jurisdictions/${code} failed:`, err);
    return NextResponse.json({ jurisdiction: null, topLaws: [] });
  }
}
