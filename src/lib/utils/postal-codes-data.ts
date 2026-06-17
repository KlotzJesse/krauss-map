import { sql } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { cacheTag, cacheLife } from "next/cache";

import {
  type CountryCode,
  COUNTRY_CONFIGS,
  COUNTRY_CODES,
} from "@/lib/config/countries";
import { db } from "@/lib/db";

// Define the type for a postal code DB row
interface PostalCodeRow {
  code: string;
  country: string;
  granularity: string;
  geometry: string;
}

type PostalFeatureCollection = FeatureCollection<Polygon | MultiPolygon>;

/**
 * Build a GeoJSON feature from a DB row, including country in properties.
 */
function rowToFeature(row: unknown) {
  const typedRow = row as unknown as PostalCodeRow;
  return {
    type: "Feature" as const,
    properties: {
      code: typedRow.code,
      country: typedRow.country,
      granularity: typedRow.granularity,
    },
    geometry: JSON.parse(typedRow.geometry),
  };
}

/**
 * Fetch postal code geodata. Pass country to filter, or omit for all DACH data.
 * Now always includes `country` in feature properties.
 */
export async function getPostalCodesDataForGranularity(
  granularity: string,
  country?: CountryCode
): Promise<PostalFeatureCollection> {
  "use cache";
  cacheLife("hours");
  const tag = country
    ? `postal-codes-geodata-${country}-${granularity}`
    : `postal-codes-geodata-all-${granularity}`;
  cacheTag("postal-codes-geodata", tag);
  try {
    const query = country
      ? sql`SELECT code, country, granularity, ST_AsGeoJSON(ST_Simplify(geometry, 0.002), 4) as geometry FROM postal_codes WHERE granularity = ${granularity} AND country = ${country} AND is_active = 'true'`
      : sql`SELECT code, country, granularity, ST_AsGeoJSON(ST_Simplify(geometry, 0.002), 4) as geometry FROM postal_codes WHERE granularity = ${granularity} AND is_active = 'true'`;
    const { rows } = await db.execute(query);
    return {
      type: "FeatureCollection",
      features: rows.map(rowToFeature),
    };
  } catch (error) {
    console.error("Error fetching postal codes from Neon:", error);
    throw error;
  }
}

/**
 * Fetch all DACH postal codes at each country's native (full) resolution.
 * DE → 5digit, AT → 4digit, CH → 4digit.
 * Returns a single merged FeatureCollection with `country` in each feature's properties.
 */
export async function getNativePostalCodesData(): Promise<PostalFeatureCollection> {
  "use cache";
  cacheLife("hours");
  cacheTag("postal-codes-geodata", "postal-codes-geodata-native");
  try {
    // Per-country simplify tolerances: 5-digit (DE) needs finer detail,
    // 4-digit (AT/CH) polygons are larger so can tolerate more simplification
    const SIMPLIFY_TOLERANCE: Record<CountryCode, number> = {
      DE: 0.002,
      AT: 0.004,
      CH: 0.004,
    };

    // Build a UNION ALL with per-country ST_Simplify tolerance
    const perCountryQueries = COUNTRY_CODES.map((code) => {
      const maxDigits = COUNTRY_CONFIGS[code].maxDigits;
      const tolerance = SIMPLIFY_TOLERANCE[code];
      return sql`SELECT code, country, granularity,
             ST_AsGeoJSON(ST_Simplify(geometry, ${tolerance}), 4) as geometry
      FROM postal_codes
      WHERE country = ${code} AND granularity = ${`${maxDigits}digit`} AND is_active = 'true'`;
    });

    const query = sql.join(perCountryQueries, sql` UNION ALL `);
    const { rows } = await db.execute(query);
    return {
      type: "FeatureCollection",
      features: rows.map(rowToFeature),
    };
  } catch (error) {
    console.error("Error fetching native DACH postal codes:", error);
    throw error;
  }
}
