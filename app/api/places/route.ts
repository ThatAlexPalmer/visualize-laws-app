import { connection, NextResponse } from "next/server";
import { resolvePlace } from "@/data/queries/jurisdictions";
import type { ApiErrorResponse, PlaceLookupResponse } from "@/data/types";

export const dynamic = "force-dynamic";

const NO_STORE = "no-store";

// City / county lookup. Separate from GET /api/jurisdictions so the US map
// payload is not mixed with place search.
export async function GET(
  req: Request,
): Promise<NextResponse<PlaceLookupResponse | ApiErrorResponse>> {
  try {
    await connection();
    const { searchParams } = new URL(req.url);
    const places = await resolvePlace({
      city: searchParams.get("city"),
      county: searchParams.get("county"),
    });
    return NextResponse.json(places, {
      headers: { "Cache-Control": NO_STORE },
    });
  } catch (error) {
    console.error("GET /api/places failed:", error);
    await connection();
    return NextResponse.json(
      { error: "Place lookup is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": NO_STORE } },
    );
  }
}
