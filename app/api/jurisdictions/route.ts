import { NextResponse } from "next/server";
import { getJurisdictions } from "@/data/queries/jurisdictions";
import type { JurisdictionsResponse } from "@/data/types";

// Aggregate rows are rebuilt after the law import. Do not bake an incomplete
// seeding snapshot into the deployment or retain a cached `national: null`.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// State-level aggregates for the map/legend + the national bounds row.
export async function GET(): Promise<NextResponse<JurisdictionsResponse>> {
  return NextResponse.json(await getJurisdictions());
}
