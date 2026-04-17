import { sql } from "drizzle-orm";
import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";

import type { CountryCode } from "@/lib/config/countries";
import { db } from "@/lib/db";

interface CountryShapeRow {
  id: string | number;
  country: string;
  name: string;
  iso3?: string | null;
  geometry: string;
  properties?: GeoJsonProperties;
}

type CountryFeatureCollection = FeatureCollection<Polygon | MultiPolygon>;

function rowToFeature(row: unknown) {
  const typedRow = row as CountryShapeRow;
  const parsedProperties =
    typeof typedRow.properties === "string"
      ? JSON.parse(typedRow.properties)
      : (typedRow.properties ?? {});
  return {
    type: "Feature" as const,
    properties: {
      id: typedRow.id.toString(),
      country: typedRow.country,
      code: typedRow.country,
      name: typedRow.name,
      iso3: typedRow.iso3,
      ...parsedProperties,
    },
    geometry: JSON.parse(typedRow.geometry),
  };
}

export async function getCountryShapesData(
  country?: CountryCode
): Promise<CountryFeatureCollection> {
  try {
    const query = country
      ? sql`SELECT id, country, name, iso3, ST_AsGeoJSON(ST_Simplify(geometry, 0.01)) as geometry, properties FROM country_shapes WHERE country = ${country} AND is_active = 'true'`
      : sql`SELECT id, country, name, iso3, ST_AsGeoJSON(ST_Simplify(geometry, 0.01)) as geometry, properties FROM country_shapes WHERE is_active = 'true'`;
    const { rows } = await db.execute(query);

    return {
      type: "FeatureCollection",
      features: rows.map(rowToFeature),
    };
  } catch (error) {
    console.error("Error fetching country shapes from Neon:", error);
    return {
      type: "FeatureCollection",
      features: [],
    };
  }
}

export async function getCountryShapesDataServer(
  country?: CountryCode
): Promise<CountryFeatureCollection | null> {
  try {
    return await getCountryShapesData(country);
  } catch (error) {
    console.error("Error in getCountryShapesDataServer:", error);
    return null;
  }
}
