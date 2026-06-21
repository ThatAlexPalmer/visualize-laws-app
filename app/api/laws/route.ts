import { NextResponse } from "next/server";
import { queryLaws } from "@/data/queries/laws";
import type { LawsResponse } from "@/data/types";

export const dynamic = "force-dynamic";

// Server-side filter / sort / pagination over the laws corpus.
export async function GET(req: Request): Promise<NextResponse<LawsResponse>> {
  const { searchParams } = new URL(req.url);
  return NextResponse.json(await queryLaws(searchParams));
}
