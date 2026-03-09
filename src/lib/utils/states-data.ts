import { sql } from "drizzle-orm";
import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import { cache } from "react";

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

async function _getStatesData(): Promise<
  FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>
> {
  try {
    // Select all columns, but geometry as GeoJSON
    const { rows } = await db.execute(
      sql`SELECT id, name, code, ST_AsGeoJSON(geometry) as geometry, properties, bbox, "created_at", "updated_at" FROM states`
    );
    const features = rows.map((row) => {
      const typedRow = row as unknown as StateRow;
      return {
        type: "Feature" as const,
        properties: {
          id: typedRow.id.toString(),
          code: typedRow.code,
          name: typedRow.name,
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
    console.error("Error fetching states from Neon:", error);
    throw error;
  }
}

export const getStatesData = cache(_getStatesData);

export async function getStatesDataServer(): Promise<FeatureCollection<
  Polygon | MultiPolygon,
  GeoJsonProperties
> | null> {
  try {
    return await getStatesData();
  } catch (error) {
    console.error("Error in getStatesDataServer:", error);
    return null;
  }
}
