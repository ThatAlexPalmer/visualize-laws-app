import { connection, NextResponse } from "next/server";
import { getJurisdictions } from "@/data/queries/jurisdictions";
import {
  isCompleteNational,
  type ApiErrorResponse,
  type JurisdictionsResponse,
} from "@/data/types";

// Complete US aggregates change only on seed — short CDN cache.
// Incomplete `national: null` / empty rows stay request-fresh.
// Place lookup is GET /api/places.
export const revalidate = 60;

const NATIONAL_CACHE = "public, s-maxage=60, stale-while-revalidate=300";
const NO_STORE = "no-store";

// State-level aggregates for the map/legend + the national bounds row.
export async function GET(): Promise<
  NextResponse<JurisdictionsResponse | ApiErrorResponse>
> {
  try {
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
