import { sql } from "drizzle-orm";
import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import { cacheTag, cacheLife } from "next/cache";

import type { CountryCode } from "@/lib/config/countries";
import { db } from "@/lib/db";

// Define the type for a postal code DB row
interface PostalCodeRow {
  id: string | number;
  code: string;
  granularity: string;
  geometry: string;
  properties?: GeoJsonProperties;
  bbox?: number[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Fetch postal code geodata. Pass country to filter, or omit for all DACH data.
 */
export async function getPostalCodesDataForGranularity(
  granularity: string,
  country?: CountryCode
): Promise<FeatureCollection<Polygon | MultiPolygon>> {
  "use cache";
  cacheLife("hours");
  const tag = country
    ? `postal-codes-geodata-${country}-${granularity}`
    : `postal-codes-geodata-all-${granularity}`;
  cacheTag("postal-codes-geodata", tag);
  try {
    const query = country
      ? sql`SELECT id, code, granularity, ST_AsGeoJSON(ST_Simplify(geometry, 0.002)) as geometry, properties, bbox, "created_at", "updated_at" FROM postal_codes WHERE granularity = ${granularity} AND country = ${country} AND is_active = 'true'`
      : sql`SELECT id, code, granularity, ST_AsGeoJSON(ST_Simplify(geometry, 0.002)) as geometry, properties, bbox, "created_at", "updated_at" FROM postal_codes WHERE granularity = ${granularity} AND is_active = 'true'`;
    const { rows } = await db.execute(query);
    const features = rows.map((row) => {
      const typedRow = row as unknown as PostalCodeRow;
      return {
        type: "Feature" as const,
        properties: {
          code: typedRow.code,
          granularity: typedRow.granularity,
          ...(typedRow.properties ?? {}),
        },
        geometry: JSON.parse(typedRow.geometry),
      };
    });
    return {
      type: "FeatureCollection",
      features,
    };
  } catch (error) {
    console.error("Error fetching postal codes from Neon:", error);
    throw error;
  }
}
