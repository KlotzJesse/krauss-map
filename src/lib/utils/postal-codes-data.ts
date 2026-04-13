import { sql } from "drizzle-orm";
import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import { cacheTag, cacheLife } from "next/cache";

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

// Fetch all postal codes for a given granularity from the Neon database as GeoJSON
export async function getPostalCodesDataForGranularity(
  granularity: string
): Promise<FeatureCollection<Polygon | MultiPolygon>> {
  "use cache";
  cacheLife("hours");
  cacheTag("postal-codes-geodata", `postal-codes-geodata-${granularity}`);
  try {
    const { rows } = await db.execute(
      sql`SELECT id, code, granularity, ST_AsGeoJSON(ST_Simplify(geometry, 0.002)) as geometry, properties, bbox, "created_at", "updated_at" FROM postal_codes WHERE granularity = ${granularity}`
    );
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
