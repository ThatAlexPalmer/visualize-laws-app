import { connection, NextResponse } from "next/server";
import {
  getJurisdictions,
  resolvePlace,
} from "@/data/queries/jurisdictions";
import {
  isCompleteNational,
  type ApiErrorResponse,
  type JurisdictionsResponse,
  type PlaceLookupResponse,
} from "@/data/types";

// Complete US aggregates change only on seed — short CDN cache. Place lookup
// and incomplete `national: null` / empty rows stay request-fresh.
export const revalidate = 60;

const NATIONAL_CACHE = "public, s-maxage=60, stale-while-revalidate=300";
const NO_STORE = "no-store";

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
      await connection();
      return NextResponse.json(await resolvePlace({ city, county }), {
        headers: { "Cache-Control": NO_STORE },
      });
    }
    const payload = await getJurisdictions();
    if (!isCompleteNational(payload)) {
      await connection();
      return NextResponse.json(payload, {
        headers: { "Cache-Control": NO_STORE },
      });
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": NATIONAL_CACHE },
    });
  } catch (error) {
    console.error("GET /api/jurisdictions failed:", error);
    await connection();
    return NextResponse.json(
      { error: "Jurisdiction aggregates are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": NO_STORE } },
    );
  }
}
