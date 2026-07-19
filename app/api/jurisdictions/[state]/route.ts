import { NextResponse } from "next/server";
import { getJurisdictionDetail } from "@/data/queries/jurisdictions";
import type { JurisdictionDetailResponse } from "@/data/types";

// State aggregates can be absent while the seed job is still rebuilding them.
// Always read current database state so a transient `jurisdiction: null` is not
// cached for the next hour.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Per-state aggregate + top laws for the jurisdiction dashboard.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ state: string }> },
): Promise<NextResponse<JurisdictionDetailResponse>> {
  const { state } = await params;
  return NextResponse.json(await getJurisdictionDetail(state));
}
