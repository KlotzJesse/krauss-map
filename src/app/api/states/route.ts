import { NextResponse } from "next/server";

import { getStatesData } from "@/lib/utils/states-data";

export async function GET() {
  const data = await getStatesData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
