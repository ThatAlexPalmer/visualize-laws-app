import { NextResponse } from "next/server";
import { getJurisdictions } from "@server/queries/jurisdictions";
import type { JurisdictionsResponse } from "@data/types";

export const dynamic = "force-dynamic";

// State-level aggregates for the map/legend + the national bounds row.
export async function GET(): Promise<NextResponse<JurisdictionsResponse>> {
  return NextResponse.json(await getJurisdictions());
}
