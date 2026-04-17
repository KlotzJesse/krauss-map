import { NextResponse } from "next/server";

import { type CountryCode, isValidCountryCode } from "@/lib/config/countries";
import { getCountryShapesData } from "@/lib/utils/country-shapes-data";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const countryParam = searchParams.get("country");
  const country: CountryCode | undefined =
    countryParam && isValidCountryCode(countryParam) ? countryParam : undefined;

  const data = await getCountryShapesData(country);

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
