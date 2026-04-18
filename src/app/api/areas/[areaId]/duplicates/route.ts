import { NextResponse } from "next/server";

import { getCrossAreaDuplicates } from "@/lib/db/data-functions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ areaId: string }> }
) {
  const { areaId } = await params;
  const id = Number.parseInt(areaId, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid areaId" }, { status: 400 });
  }

  const duplicates = await getCrossAreaDuplicates(id);
  return NextResponse.json(duplicates);
}
