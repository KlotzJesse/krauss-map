import { sql } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { cacheTag, cacheLife } from "next/cache";
import { topology } from "topojson-server";
import type { Topology } from "topojson-specification";

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
 * Quantization grid for the TopoJSON encoding. Germany spans ~9.3 degrees of
 * longitude, so 1e5 steps is ~7m — finer than the 4-decimal (~11m) rounding
 * the GeoJSON responses used to apply.
 */
const TOPO_QUANTIZATION = 1e5;

/**
 * Encode a FeatureCollection as TopoJSON.
 *
 * Postal codes tile the country, so neighbours share almost every boundary.
 * GeoJSON stores each shared border twice; TopoJSON stores it once as an arc
 * both polygons reference. That halves the payload *and* keeps neighbours
 * exactly coincident — the reason the old ST_Simplify pass could be dropped,
 * since simplifying each polygon independently pulled shared borders apart
 * into slivers.
 */
function toTopoJSON(fc: PostalFeatureCollection): Topology {
  return topology(
    { pc: fc as unknown as Parameters<typeof topology>[0][string] },
    TOPO_QUANTIZATION
  );
}

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
      ? sql`SELECT code, country, granularity, ST_AsGeoJSON(geometry, 5) as geometry FROM postal_codes WHERE granularity = ${granularity} AND country = ${country} AND is_active = 'true'`
      : sql`SELECT code, country, granularity, ST_AsGeoJSON(geometry, 5) as geometry FROM postal_codes WHERE granularity = ${granularity} AND is_active = 'true'`;
    const { rows } = await db.execute(query);
    return {
      type: "FeatureCollection",
      features: rows.map(rowToFeature),
    };
  } catch (error) {
    console.error("Error fetching postal codes:", error);
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
    // No per-country simplify tolerance any more: the TopoJSON encoding shares
    // borders between neighbours, so size comes from quantization rather than
    // from throwing vertices away per polygon.
    const perCountryQueries = COUNTRY_CODES.map((code) => {
      const maxDigits = COUNTRY_CONFIGS[code].maxDigits;
      return sql`SELECT code, country, granularity,
             ST_AsGeoJSON(geometry, 5) as geometry
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

/** TopoJSON form of {@link getPostalCodesDataForGranularity}. */
export async function getPostalCodesTopoForGranularity(
  granularity: string,
  country?: CountryCode
): Promise<Topology> {
  "use cache";
  cacheLife("hours");
  const tag = country
    ? `postal-codes-topo-${country}-${granularity}`
    : `postal-codes-topo-all-${granularity}`;
  cacheTag("postal-codes-geodata", tag);
  return toTopoJSON(
    await getPostalCodesDataForGranularity(granularity, country)
  );
}

/** TopoJSON form of {@link getNativePostalCodesData}. */
export async function getNativePostalCodesTopo(): Promise<Topology> {
  "use cache";
  cacheLife("hours");
  cacheTag("postal-codes-geodata", "postal-codes-topo-native");
  return toTopoJSON(await getNativePostalCodesData());
}
