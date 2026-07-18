import { NextResponse } from "next/server";
import { getJurisdictionDetail } from "@/data/queries/jurisdictions";
import type { JurisdictionDetailResponse } from "@/data/types";

export const dynamic = "force-static";
export const revalidate = 3600;

// Per-state aggregate + top laws for the jurisdiction dashboard.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ state: string }> },
): Promise<NextResponse<JurisdictionDetailResponse>> {
  const { state } = await params;
  return NextResponse.json(await getJurisdictionDetail(state));
}
