import { NextResponse } from "next/server";
import type { JurisdictionDetailResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// STUB (owned by agent-map). Replace with: the level='state' aggregate for
// `state` plus its top laws (e.g. ordered by the selected axis).
// Note: Next.js 15 route params are async (a Promise).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ state: string }> },
): Promise<NextResponse<JurisdictionDetailResponse>> {
  await params;
  return NextResponse.json({ jurisdiction: null, topLaws: [] });
}
