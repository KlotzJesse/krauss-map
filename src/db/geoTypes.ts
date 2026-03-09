import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
// filename: db/postgis-types.ts
import { customType } from "drizzle-orm/pg-core";

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface GeoJSONMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

export interface GeoJSONMultiPoint {
  type: "MultiPoint";
  coordinates: number[][];
}

const SRID = 4326;

/**
 * Build a geometry expression from GeoJSON with SRID.
 */
export function geomFromGeoJSONExpr(geojson: unknown, srid = SRID): SQL {
  return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(
    geojson
  )}), ${srid})`;
}

/**
 * Normalize Polygon/MultiPolygon to MultiPolygon.
 * ST_CollectionExtract(..., 3) extracts polygonal components, ST_Multi casts to MultiPolygon.
 */
export function toMultiPolygonExpr(
  geojson: GeoJSONPolygon | GeoJSONMultiPolygon,
  srid = SRID
): SQL {
  const base = geomFromGeoJSONExpr(geojson, srid);
  return sql`ST_Multi(ST_CollectionExtract(${base}, 3))`;
}

/**
 * Decode geometry to GeoJSON in SELECTs.
 */
export function geomToGeoJSONExpr(column: string): SQL {
  return sql`ST_AsGeoJSON(${sql.identifier(column)})::jsonb`;
}

/**
 * Your custom column types: these only affect DDL.
 * We’ll still use SQL helpers during INSERT/UPDATE.
 */
export const multiPolygon = customType<{ data: string; notNull: true }>({
  dataType() {
    return `geometry(MultiPolygon, ${SRID})`;
  },
});

export const polygon = customType<{ data: string; notNull: true }>({
  dataType() {
    return `geometry(Polygon, ${SRID})`;
  },
});

export const multiPoint = customType<{ data: string; notNull: true }>({
  dataType() {
    return `geometry(MultiPoint, ${SRID})`;
  },
});
