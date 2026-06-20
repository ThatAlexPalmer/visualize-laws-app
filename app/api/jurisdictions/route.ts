import { NextResponse } from "next/server";
import type { JurisdictionsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// STUB (owned by agent-map). Replace with a query over the `Jurisdiction` table:
//   - rows: all level='state' aggregates (for the choropleth + legend)
//   - national: the single level='national' row incl. per-axis bounds
export async function GET(): Promise<NextResponse<JurisdictionsResponse>> {
  return NextResponse.json({ rows: [], national: null });
}
