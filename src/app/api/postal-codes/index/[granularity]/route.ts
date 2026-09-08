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
  a: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The postal-code index: every code in the country with a representative point,
 * its area and its bounding box — everything about a postal code except its
 * outline.
 *
 * Almost nothing in the app actually needs outlines. Layer membership, coverage
 * statistics, conflict detection, import matching, select-all, label placement,
 * lasso and radius selection, and zoom-to-layer all work off codes, centroids
 * and bounds. They were nonetheless paying for the full country geometry,
 * because codes and outlines arrived in one payload — and then recomputing
 * centroids from those outlines on the main thread on every load.
 *
 * Measured on the German 5-digit set: 123KB gzipped against 867KB for the
 * geometry. Two things buy that. Parallel arrays rather than one object per
 * code: the same values as records cost roughly three times as much before
 * compression. And integers rather than floats — coordinates are quantized to
 * 1e-4 degrees (~11m) and bounds to 1e-3 degrees (~110m), which is far below
 * what any of these consumers can distinguish, and short integers compress
 * about a third better than full-precision decimals.
 */
async function loadIndex(granularity: string, country: CountryCode) {
  "use cache";
  cacheLife("days");
  cacheTag("postal-code-index", `postal-code-index-${country}-${granularity}`);

  const { rows } = await db.execute<IndexRow>(sql`
    SELECT code,
           ST_X(ST_PointOnSurface(geometry)) AS cx,
           ST_Y(ST_PointOnSurface(geometry)) AS cy,
           ST_Area(geometry::geography) / 1e6 AS a,
           ST_XMin(geometry) AS x0,
           ST_YMin(geometry) AS y0,
           ST_XMax(geometry) AS x1,
           ST_YMax(geometry) AS y1
    FROM postal_codes
    WHERE country = ${country}
      AND granularity = ${granularity}
      AND is_active = 'true'
    ORDER BY code
  `);

  const codes: string[] = [];
  /** [x, y, ...] in 1e-4 degrees. One representative point per code. */
  const cen: number[] = [];
  /** Area in tenths of a square kilometre, used to weight label placement. */
  const area: number[] = [];
  /** [x0, y0, x1, y1, ...] in 1e-3 degrees, relative to the code's centroid. */
  const bb: number[] = [];

  for (const row of rows) {
    const cx = Math.round(row.cx * 1e4);
    const cy = Math.round(row.cy * 1e4);
    // Bounds are stored as offsets from the centroid: the numbers stay small,
    // which is most of why this compresses.
    const bx = Math.round(cx / 10);
    const by = Math.round(cy / 10);

    codes.push(row.code);
    cen.push(cx, cy);
    area.push(Math.round(row.a * 10));
    bb.push(
      Math.round(row.x0 * 1e3) - bx,
      Math.round(row.y0 * 1e3) - by,
      Math.round(row.x1 * 1e3) - bx,
      Math.round(row.y1 * 1e3) - by
    );
  }

  return { country, granularity, codes, cen, area, bb };
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
