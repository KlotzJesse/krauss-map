import { NextResponse } from "next/server";

import { getPostalCodesDataForGranularity } from "@/lib/utils/postal-codes-data";

const VALID_GRANULARITIES = new Set(["1digit", "2digit", "3digit", "5digit"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ granularity: string }> }
) {
  const { granularity } = await params;

  if (!VALID_GRANULARITIES.has(granularity)) {
    return NextResponse.json({ error: "Invalid granularity" }, { status: 400 });
  }

  const data = await getPostalCodesDataForGranularity(granularity);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
