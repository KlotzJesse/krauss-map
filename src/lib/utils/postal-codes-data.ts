import { sql } from "drizzle-orm";
import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import { cacheTag, cacheLife } from "next/cache";

import {
  type CountryCode,
  COUNTRY_CONFIGS,
  COUNTRY_CODES,
} from "@/lib/config/countries";
import { db } from "@/lib/db";

// Define the type for a postal code DB row
interface PostalCodeRow {
  id: string | number;
  code: string;
  country: string;
  granularity: string;
  geometry: string;
  properties?: GeoJsonProperties;
  bbox?: number[];
  created_at?: string;
  updated_at?: string;
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
      ...(typedRow.properties ?? {}),
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
      ? sql`SELECT id, code, country, granularity, ST_AsGeoJSON(ST_Simplify(geometry, 0.002)) as geometry, properties, bbox FROM postal_codes WHERE granularity = ${granularity} AND country = ${country} AND is_active = 'true'`
      : sql`SELECT id, code, country, granularity, ST_AsGeoJSON(ST_Simplify(geometry, 0.002)) as geometry, properties, bbox FROM postal_codes WHERE granularity = ${granularity} AND is_active = 'true'`;
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
    // Build a UNION ALL query for each country at its native resolution
    const conditions = COUNTRY_CODES.map((code) => {
      const maxDigits = COUNTRY_CONFIGS[code].maxDigits;
      return sql`(country = ${code} AND granularity = ${`${maxDigits}digit`})`;
    });

    const whereClause = sql.join(conditions, sql` OR `);
    const query = sql`
      SELECT id, code, country, granularity,
             ST_AsGeoJSON(ST_Simplify(geometry, 0.002)) as geometry,
             properties, bbox
      FROM postal_codes
      WHERE (${whereClause}) AND is_active = 'true'
    `;
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
