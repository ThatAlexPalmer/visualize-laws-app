import { NextResponse } from "next/server";
import { getLawById } from "@/data/queries/laws";
import type { ApiErrorResponse, LawDetailResponse } from "@/data/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DetailResponse = LawDetailResponse | ApiErrorResponse;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<DetailResponse>> {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) {
    return NextResponse.json(
      { error: "Law id must be a positive integer." },
      { status: 400 },
    );
  }

  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: "Law id must be a positive integer." },
      { status: 400 },
    );
  }

  try {
    const law = await getLawById(id);
    if (!law) {
      return NextResponse.json({ error: "Law not found." }, { status: 404 });
    }
    return NextResponse.json({ law });
  } catch (err) {
    console.error(`getLawById(${id}) failed:`, err);
    return NextResponse.json(
      { error: "Could not load law detail." },
      { status: 500 },
    );
  }
}
