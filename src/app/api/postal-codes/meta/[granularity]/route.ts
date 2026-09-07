import { type CountryCode, isValidCountryCode } from "@/lib/config/countries";
import { getPostalCodeMeta } from "@/lib/utils/postal-code-meta";

const VALID_GRANULARITIES = new Set([
  "1digit",
  "2digit",
  "3digit",
  "4digit",
  "5digit",
]);

/**
 * Hover-card metadata for one country/granularity. Fetched lazily by the map
 * the first time a polygon is hovered, so it never delays the initial load.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ granularity: string }> }
) {
  const { granularity } = await params;
  const countryParam = new URL(request.url).searchParams.get("country");
  const country: CountryCode =
    countryParam && isValidCountryCode(countryParam) ? countryParam : "DE";

  if (!VALID_GRANULARITIES.has(granularity)) {
    return Response.json({ error: "Invalid granularity" }, { status: 400 });
  }

  const data = await getPostalCodeMeta(granularity, country);
  const stream = new Blob([JSON.stringify(data)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      // Changes only when the postal-code dataset is reimported.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
