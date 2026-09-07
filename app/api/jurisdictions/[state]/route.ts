import { NextResponse } from "next/server";
import { getJurisdictionDetail } from "@/data/queries/jurisdictions";
import type { JurisdictionDetailResponse } from "@/data/types";

// State aggregates can be absent while the seed job is still rebuilding them.
// Always read current database state so a transient `jurisdiction: null` is not
// cached for the next hour.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Per-state (or ?county= scoped) aggregate + top laws + in-state counties/cities.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ state: string }> },
): Promise<NextResponse<JurisdictionDetailResponse | { error: string }>> {
  const { state } = await params;
  const { searchParams } = new URL(req.url);
  try {
    return NextResponse.json(
      await getJurisdictionDetail(state, searchParams.get("county")),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load jurisdiction detail." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
