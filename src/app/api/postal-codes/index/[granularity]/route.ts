import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { type CountryCode, isValidCountryCode } from "@/lib/config/countries";
import { db } from "@/lib/db";

const VALID_GRANULARITIES = new Set([
  "1digit",
  "2digit",
  "3digit",
  "4digit",
  "5digit",
]);

interface IndexRow extends Record<string, unknown> {
  code: string;
  cx: number;
  cy: number;
}

/**
 * The postal-code index: every code in the country plus a representative point,
 * and no polygon outlines.
 *
 * Most of what the app does with geodata never touches coordinates — layer
 * membership, coverage statistics, conflict detection, import matching and
 * select-all all work off the code list alone. They were nonetheless paying for
 * the full country geometry, because codes and outlines arrived in one payload.
 *
 * Measured on the German 5-digit set: 67KB gzipped against 867KB for the
 * geometry. Parallel arrays rather than one object per code — the same values
 * as records cost roughly three times as much before compression.
 */
async function loadIndex(granularity: string, country: CountryCode) {
  "use cache";
  cacheLife("days");
  cacheTag("postal-code-index", `postal-code-index-${country}-${granularity}`);

  const { rows } = await db.execute<IndexRow>(sql`
    SELECT code,
           round(ST_X(ST_PointOnSurface(geometry))::numeric, 4)::float8 AS cx,
           round(ST_Y(ST_PointOnSurface(geometry))::numeric, 4)::float8 AS cy
    FROM postal_codes
    WHERE country = ${country}
      AND granularity = ${granularity}
      AND is_active = 'true'
    ORDER BY code
  `);

  const codes: string[] = [];
  // [x0, y0, x1, y1, ...] — one representative point per code, same order.
  const cen: number[] = [];
  for (const row of rows) {
    codes.push(row.code);
    cen.push(row.cx, row.cy);
  }
  return { country, granularity, codes, cen };
}

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

  const data = await loadIndex(granularity, country);
  const stream = new Blob([JSON.stringify(data)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
