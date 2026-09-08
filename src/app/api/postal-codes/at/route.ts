import { sql } from "drizzle-orm";

import { isValidCountryCode } from "@/lib/config/countries";
import { db } from "@/lib/db";

const VALID_GRANULARITIES = new Set([
  "1digit",
  "2digit",
  "3digit",
  "4digit",
  "5digit",
]);

interface HitRow extends Record<string, unknown> {
  code: string;
  country: string;
}

/** Stored postal code prefix by ISO country code. */
const PREFIX: Record<string, string> = { DE: "D", AT: "A", CH: "CH" };

/**
 * Which postal code contains a point.
 *
 * Used when an address is picked from search: the geocoder gives coordinates,
 * and the code that actually contains them is authoritative over whatever the
 * geocoder claims. This used to be answered on the client by walking every
 * polygon in the country, which is most of why the full geometry was loaded at
 * all. PostGIS answers it from the spatial index against one point.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lng = Number.parseFloat(url.searchParams.get("lng") ?? "");
  const lat = Number.parseFloat(url.searchParams.get("lat") ?? "");
  const granularity = url.searchParams.get("granularity") ?? "5digit";

  if (!(Number.isFinite(lng) && Number.isFinite(lat))) {
    return Response.json({ error: "Invalid coordinates" }, { status: 400 });
  }
  if (!VALID_GRANULARITIES.has(granularity)) {
    return Response.json({ error: "Invalid granularity" }, { status: 400 });
  }

  const countries = (url.searchParams.get("country") ?? "DE")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => isValidCountryCode(c));
  if (countries.length === 0) {
    return Response.json({ error: "Invalid country" }, { status: 400 });
  }

  const { rows } = await db.execute<HitRow>(sql`
    SELECT code, country
    FROM postal_codes
    WHERE country IN (${sql.join(
      countries.map((c) => sql`${c}`),
      sql`, `
    )})
      AND granularity = ${granularity}
      AND is_active = 'true'
      AND ST_Contains(geometry, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
    LIMIT 1
  `);

  const hit = rows[0];
  if (!hit) {
    return Response.json({ code: null });
  }

  const prefix = PREFIX[hit.country];
  return Response.json({
    code: prefix ? `${prefix}-${hit.code}` : hit.code,
  });
}
