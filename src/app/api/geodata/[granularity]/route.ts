import { NextResponse } from "next/server";

import { type CountryCode, isValidCountryCode } from "@/lib/config/countries";
import { getPostalCodesDataForGranularity } from "@/lib/utils/postal-codes-data";

const VALID_GRANULARITIES = new Set([
  "1digit",
  "2digit",
  "3digit",
  "4digit",
  "5digit",
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ granularity: string }> }
) {
  const { granularity } = await params;
  const { searchParams } = new URL(request.url);
  const countryParam = searchParams.get("country");
  const country: CountryCode | undefined =
    countryParam && isValidCountryCode(countryParam) ? countryParam : undefined;

  if (!VALID_GRANULARITIES.has(granularity)) {
    return NextResponse.json({ error: "Invalid granularity" }, { status: 400 });
  }

  const data = await getPostalCodesDataForGranularity(granularity, country);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
