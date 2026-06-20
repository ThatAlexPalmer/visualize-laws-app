import { NextResponse } from "next/server";
import type { LawsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

// STUB (owned by agent-ui). Replace with server-side filtering/sort/pagination
// over the `Law` table. Supported params: q (full-text via search_vector),
// per-axis score min/max, state, county, function, topic, isSubstantive,
// page, pageSize, sort.
export async function GET(req: Request): Promise<NextResponse<LawsResponse>> {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 25)));
  return NextResponse.json({ rows: [], total: 0, page, pageSize });
}
