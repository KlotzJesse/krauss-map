/**
 * Import country borders (DE/AT/CH) into country_shapes.
 *
 * Source (stable URL):
 * https://datahub.io/core/geo-countries/_r/-/data/countries.geojson
 *
 * Usage:
 *   bun scripts/import-country-shapes.ts
 *   bun scripts/import-country-shapes.ts --dry-run
 */
import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";

const DATASET_URL =
  "https://datahub.io/core/geo-countries/_r/-/data/countries.geojson";
const TARGET_COUNTRIES = new Set(["DE", "AT", "CH"]);
const dryRun = process.argv.includes("--dry-run");

interface SourceFeature {
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
  properties: {
    name: string;
    "ISO3166-1-Alpha-2": string;
    "ISO3166-1-Alpha-3": string;
  };
}

interface SourceGeoJSON {
  type: string;
  features: SourceFeature[];
}

function log(message: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${message}\n`);
}

async function ensureCountryShapesTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS country_shapes (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      country varchar(2) NOT NULL,
      name varchar(255) NOT NULL,
      iso3 varchar(3),
      is_active varchar(5) NOT NULL DEFAULT 'true',
      source_release varchar(50),
      geometry geometry(MultiPolygon, 4326) NOT NULL,
      properties jsonb,
      bbox jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT country_shapes_country_unique UNIQUE(country)
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_country_shapes_country ON country_shapes USING btree (country)`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_country_shapes_geometry ON country_shapes USING gist (geometry)`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_country_shapes_is_active ON country_shapes USING btree (is_active)`
  );
}

async function main(): Promise<void> {
  log("=== Country Shapes Import (DE/AT/CH) ===");
  log(`Source: ${DATASET_URL}`);
  log(`Dry run: ${dryRun}`);

  await ensureCountryShapesTable();

  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch source (${response.status})`);
  }

  const source = (await response.json()) as SourceGeoJSON;
  const selected = source.features.filter((feature) =>
    TARGET_COUNTRIES.has(feature.properties["ISO3166-1-Alpha-2"])
  );

  if (selected.length === 0) {
    throw new Error("No DE/AT/CH features found in source dataset");
  }

  log(`Selected ${selected.length} features`);

  if (dryRun) {
    for (const feature of selected) {
      log(
        `  ${feature.properties["ISO3166-1-Alpha-2"]}: ${feature.properties.name} (${feature.geometry.type})`
      );
    }
    log("[DRY RUN] No database writes performed");
    return;
  }

  for (const feature of selected) {
    const country = feature.properties["ISO3166-1-Alpha-2"];
    const name = feature.properties.name;
    const iso3 = feature.properties["ISO3166-1-Alpha-3"];
    const geometry = JSON.stringify(feature.geometry).replace(/'/g, "''");
    const properties = JSON.stringify({
      source: "datahub-geo-countries",
      sourceName: name,
      iso2: country,
      iso3,
    }).replace(/'/g, "''");

    await db.execute(
      sql.raw(`
        INSERT INTO country_shapes (country, name, iso3, is_active, source_release, geometry, properties, bbox, created_at, updated_at)
        VALUES (
          '${country}',
          '${name.replace(/'/g, "''")}',
          '${iso3.replace(/'/g, "''")}',
          'true',
          'datahub-geo-countries-0.2.0',
          ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON('${geometry}'), 4326)), 3)),
          '${properties}'::jsonb,
          to_jsonb(ARRAY[
            ST_XMin(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON('${geometry}'), 4326))),
            ST_YMin(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON('${geometry}'), 4326))),
            ST_XMax(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON('${geometry}'), 4326))),
            ST_YMax(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON('${geometry}'), 4326)))
          ]),
          NOW(),
          NOW()
        )
        ON CONFLICT (country) DO UPDATE SET
          name = EXCLUDED.name,
          iso3 = EXCLUDED.iso3,
          is_active = 'true',
          source_release = EXCLUDED.source_release,
          geometry = EXCLUDED.geometry,
          properties = EXCLUDED.properties,
          bbox = EXCLUDED.bbox,
          updated_at = NOW()
      `)
    );

    log(`  Upserted ${country} (${name})`);
  }

  const { rows } = await db.execute(sql`
    SELECT country, name, source_release
    FROM country_shapes
    WHERE country IN ('DE', 'AT', 'CH') AND is_active = 'true'
    ORDER BY country
  `);

  log("\nVerification:");
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    log(
      `  ${String(record.country)}: ${String(record.name)} (${String(record.source_release)})`
    );
  }

  log("\n✅ Country shapes import complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});