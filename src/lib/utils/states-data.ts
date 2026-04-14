import { sql } from "drizzle-orm";
import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import { cacheTag, cacheLife } from "next/cache";

import type { CountryCode } from "@/lib/config/countries";
import { DEFAULT_COUNTRY } from "@/lib/config/countries";
import { db } from "@/lib/db";

// Define the type for a state DB row
interface StateRow {
  id: string | number;
  name: string;
  code: string;
  geometry: string;
  properties?: GeoJsonProperties;
  bbox?: number[];
  created_at?: string;
  updated_at?: string;
}

export async function getStatesData(
  country: CountryCode = DEFAULT_COUNTRY
): Promise<FeatureCollection<Polygon | MultiPolygon>> {
  "use cache";
  cacheLife("days");
  cacheTag("states-geodata", `states-geodata-${country}`);
  try {
    const { rows } = await db.execute(
      sql`SELECT id, name, code, ST_AsGeoJSON(ST_Simplify(geometry, 0.005)) as geometry, properties, bbox, "created_at", "updated_at" FROM states WHERE country = ${country}`
    );
    const features = rows.map((row) => {
      const typedRow = row as unknown as StateRow;
      const parsedProperties =
        typeof typedRow.properties === "string"
          ? JSON.parse(typedRow.properties)
          : (typedRow.properties ?? {});
      return {
        type: "Feature" as const,
        properties: {
          id: typedRow.id.toString(),
          code: typedRow.code,
          name: typedRow.name,
          ...parsedProperties,
        },
        geometry: JSON.parse(typedRow.geometry),
      };
    });
    return {
      type: "FeatureCollection",
      features,
    };
  } catch (error) {
    console.error("Error fetching states from Neon:", error);
    throw error;
  }
}

export async function getStatesDataServer(
  country: CountryCode = DEFAULT_COUNTRY
): Promise<FeatureCollection<Polygon | MultiPolygon> | null> {
  try {
    return await getStatesData(country);
  } catch (error) {
    console.error("Error in getStatesDataServer:", error);
    return null;
  }
}
