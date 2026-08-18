import { NextResponse } from "next/server";
import {
  getJurisdictions,
  resolvePlace,
} from "@/data/queries/jurisdictions";
import type {
  ApiErrorResponse,
  JurisdictionsResponse,
  PlaceLookupResponse,
} from "@/data/types";

// Aggregate rows are rebuilt after the law import. Do not bake an incomplete
// seeding snapshot into the deployment or retain a cached `national: null`.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// State-level aggregates for the map/legend + the national bounds row.
// Optional ?city= / ?county= is a place lookup and does not grow the US map payload.
export async function GET(
  req: Request,
): Promise<
  NextResponse<JurisdictionsResponse | PlaceLookupResponse | ApiErrorResponse>
> {
  try {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city");
    const county = searchParams.get("county");
    if (city?.trim() || county?.trim()) {
      return NextResponse.json(await resolvePlace({ city, county }));
    }
    return NextResponse.json(await getJurisdictions());
  } catch (error) {
    console.error("GET /api/jurisdictions failed:", error);
    return NextResponse.json(
      { error: "Jurisdiction aggregates are temporarily unavailable." },
      { status: 503 },
    );
  }
}
