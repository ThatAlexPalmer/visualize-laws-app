import { NextResponse } from "next/server";
import { searchParamsToFilters } from "@/data/filters";
import { queryLaws } from "@/data/queries/laws";
import type { ApiErrorResponse, LawsResponse } from "@/data/types";

export const dynamic = "force-dynamic";

// Server-side filter / sort / pagination over the laws corpus.
export async function GET(
  req: Request,
): Promise<NextResponse<LawsResponse | ApiErrorResponse>> {
  const filters = searchParamsToFilters(new URL(req.url).searchParams);
  try {
    return NextResponse.json(await queryLaws(filters));
  } catch (err) {
    console.error("GET /api/laws failed:", err);
    return NextResponse.json(
      { error: "Law results are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
