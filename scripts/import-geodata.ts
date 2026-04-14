/**
 * DACH Geodata Import Script
 *
 * Imports postal code polygon data for DE, AT, CH into the postal_codes table.
 * Uses a staging table approach for clean upserts.
 *
 * Sources:
 *   DE: PostDirekt geocodes API (5-digit PLZ with MultiPolygon)
 *   AT: kolmann.at vorwahlen+plz.json (Gemeinde→PLZ mapping, needs dissolve)
 *   CH: swisstopo shapefile EPSG:2056 (ZIP4 features, needs dissolve + reproject)
 *
 * Coarser granularities (1/2/3-digit) are derived via PostGIS ST_Union.
 *
 * Usage:
 *   bun scripts/import-geodata.ts --country=DE|AT|CH|ALL [--dry-run] [--skip-coarse]
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const countryArg =
  args
    .find((a) => a.startsWith("--country="))
    ?.split("=")[1]
    ?.toUpperCase() ?? "ALL";
const dryRun = args.includes("--dry-run");
const skipCoarse = args.includes("--skip-coarse");

const COUNTRIES_TO_IMPORT =
  countryArg === "ALL" ? ["DE", "AT", "CH"] : [countryArg];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const POSTDIREKT_GEOCODES =
  "https://postdirekt.de/plzsuche-service/geocodes?postal_code=";
const AT_GEMEINDEN_URL =
  "https://www.kolmann.at/austria-post-and-area-code/data/vorwahlen+plz.json.zip";
const CH_SHP_URL =
  "https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_2056.shp.zip";

const BATCH_SIZE = 50;
const TEMP_DIR = path.resolve("/tmp/geodata-import-run");

// Expected counts for validation
const EXPECTED_COUNTS: Record<string, { min: number; max: number }> = {
  DE: { min: 8100, max: 8300 },
  AT: { min: 2400, max: 2600 },
  CH: { min: 3100, max: 3300 },
};

// Coarse granularity config per country
const COARSE_CONFIG: Record<string, { finest: string; levels: number[] }> = {
  DE: { finest: "5digit", levels: [1, 2, 3] },
  AT: { finest: "4digit", levels: [1, 2, 3] },
  CH: { finest: "4digit", levels: [1, 2, 3] },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

async function fetchJson(url: string): Promise<unknown> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.json();
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function ensureStagingTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _staging_postal_codes (
      code VARCHAR(10) NOT NULL,
      country VARCHAR(2) NOT NULL,
      granularity VARCHAR(20) NOT NULL,
      geometry GEOMETRY,
      properties JSONB,
      source_release VARCHAR(50),
      UNIQUE(country, granularity, code)
    )
  `);
  await db.execute(sql`TRUNCATE _staging_postal_codes`);
}

async function dropStagingTable() {
  await db.execute(sql`DROP TABLE IF EXISTS _staging_postal_codes`);
}

// ---------------------------------------------------------------------------
// DE: PostDirekt geocodes
// ---------------------------------------------------------------------------
interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
}

interface GeoJSONCollection {
  type: string;
  features: GeoJSONFeature[];
}

async function fetchDE(): Promise<number> {
  log("DE: Fetching from PostDirekt geocodes API...");

  const prefixes = Array.from({ length: 100 }, (_, i) =>
    i.toString().padStart(2, "0")
  );

  let totalInserted = 0;
  const CONCURRENCY = 10;

  for (let batch = 0; batch < 10; batch++) {
    const batchPrefixes = prefixes.slice(
      batch * CONCURRENCY,
      (batch + 1) * CONCURRENCY
    );

    const batchFeatures: GeoJSONFeature[] = [];

    const results = await Promise.allSettled(
      batchPrefixes.map(async (prefix) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const data = (await fetchJson(
              `${POSTDIREKT_GEOCODES}${prefix}`
            )) as GeoJSONCollection;
            return data.features ?? [];
          } catch {
            if (attempt < 2) await sleep(1000 * (attempt + 1));
          }
        }
        return [];
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        batchFeatures.push(...(result.value as GeoJSONFeature[]));
      }
    }

    // Insert batch into staging
    for (let i = 0; i < batchFeatures.length; i += BATCH_SIZE) {
      const chunk = batchFeatures.slice(i, i + BATCH_SIZE);
      await insertStagingBatch(chunk, "DE", "5digit");
      totalInserted += chunk.length;
    }

    log(
      `  Batch ${batch + 1}/10: ${batchFeatures.length} features (total: ${totalInserted})`
    );
  }

  return totalInserted;
}

// ---------------------------------------------------------------------------
// AT: kolmann.at Gemeinden → PLZ dissolve
// ---------------------------------------------------------------------------
interface ATFeature {
  type: string;
  geometry: { type: string; coordinates: unknown };
  properties: {
    name: string;
    iso: string;
    plz?: Record<string, string>;
  };
}

async function fetchAT(): Promise<number> {
  log("AT: Downloading kolmann.at Gemeinden data...");
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const zipBuf = await downloadBuffer(AT_GEMEINDEN_URL);
  const zipPath = path.join(TEMP_DIR, "at_gemeinden.zip");
  fs.writeFileSync(zipPath, zipBuf);

  // Extract using unzip
  const { execSync } = await import("node:child_process");
  const extractDir = path.join(TEMP_DIR, "at_gemeinden");
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" });

  // Find the JSON file
  const jsonFile = fs.readdirSync(extractDir).find((f) => f.endsWith(".json"));
  if (!jsonFile) throw new Error("No JSON file found in AT zip");
  const data = JSON.parse(
    fs.readFileSync(path.join(extractDir, jsonFile), "utf8")
  ) as { features: ATFeature[] };

  log(`  Parsed ${data.features.length} Gemeinde features`);

  // Explode: for each Gemeinde, emit one feature per PLZ code
  // Group by PLZ code → collect geometries
  const plzGeometries = new Map<string, object[]>();
  const plzNames = new Map<string, string>();

  for (const feature of data.features) {
    const plzDict = feature.properties?.plz;
    if (!plzDict || !feature.geometry) continue;
    for (const [code, name] of Object.entries(plzDict)) {
      if (!plzGeometries.has(code)) {
        plzGeometries.set(code, []);
        plzNames.set(code, name);
      }
      plzGeometries.get(code)!.push(feature.geometry);
    }
  }

  log(`  Found ${plzGeometries.size} unique PLZ codes`);

  // Insert per-PLZ features into staging
  // For PLZ with single Gemeinde → use geometry directly
  // For PLZ with multiple Gemeinden → insert all as separate rows, PostGIS will dissolve
  let totalInserted = 0;
  const batch: { code: string; geojson: string; props: string }[] = [];

  for (const [code, geometries] of plzGeometries) {
    for (const geom of geometries) {
      batch.push({
        code,
        geojson: JSON.stringify(geom),
        props: JSON.stringify({ name: plzNames.get(code) }),
      });
    }
  }

  // Insert into staging with ON CONFLICT to handle dissolving later in PostGIS
  // We'll insert raw per-Gemeinde polygons into a temp table, then dissolve
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _staging_at_raw (
      code VARCHAR(10) NOT NULL,
      geometry GEOMETRY(Geometry, 4326),
      properties JSONB
    )
  `);
  await db.execute(sql`TRUNCATE _staging_at_raw`);

  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    const values = chunk
      .map(
        (r) =>
          `('${r.code}', ST_SetSRID(ST_GeomFromGeoJSON('${r.geojson.replace(/'/g, "''")}'), 4326), '${r.props.replace(/'/g, "''")}'::jsonb)`
      )
      .join(",\n");

    await db.execute(
      sql.raw(`
        INSERT INTO _staging_at_raw (code, geometry, properties) VALUES ${values}
      `)
    );
    totalInserted += chunk.length;
  }

  log(`  Inserted ${totalInserted} raw Gemeinde→PLZ rows`);

  // Dissolve by PLZ code using PostGIS
  log("  Dissolving by PLZ code in PostGIS...");
  const { rows: dissolved } = await db.execute(sql`
    INSERT INTO _staging_postal_codes (code, country, granularity, geometry, properties, source_release)
    SELECT
      code,
      'AT',
      '4digit',
      ST_Multi(ST_MakeValid(ST_UnaryUnion(ST_Collect(geometry)))),
      (SELECT properties FROM _staging_at_raw r2 WHERE r2.code = _staging_at_raw.code LIMIT 1),
      'kolmann-2026'
    FROM _staging_at_raw
    GROUP BY code
    ON CONFLICT (country, granularity, code)
    DO UPDATE SET geometry = EXCLUDED.geometry, properties = EXCLUDED.properties, source_release = EXCLUDED.source_release
    RETURNING code
  `);

  await db.execute(sql`DROP TABLE IF EXISTS _staging_at_raw`);

  log(`  Dissolved into ${dissolved.length} AT PLZ polygons`);
  return dissolved.length;
}

// ---------------------------------------------------------------------------
// CH: swisstopo shapefile (EPSG:2056 → 4326)
// ---------------------------------------------------------------------------
async function fetchCH(): Promise<number> {
  log("CH: Downloading swisstopo PLZ shapefile...");
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const zipBuf = await downloadBuffer(CH_SHP_URL);
  const zipPath = path.join(TEMP_DIR, "ch_plz.shp.zip");
  fs.writeFileSync(zipPath, zipBuf);
  log(`  Downloaded ${(zipBuf.length / 1024 / 1024).toFixed(1)} MB`);

  const { execSync } = await import("node:child_process");
  const extractDir = path.join(TEMP_DIR, "ch_shp");
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: "pipe" });

  // Find the ZIP shapefile
  const shpFile = findFile(extractDir, ".shp", "ZIP");
  if (!shpFile) throw new Error("No ZIP shapefile found in CH extract");
  const dbfFile = shpFile.replace(".shp", ".dbf");

  log(`  Reading shapefile: ${path.basename(shpFile)}`);

  // Read all features using the shapefile library
  const shapefile = await import("shapefile");
  const source = await shapefile.open(shpFile, dbfFile);

  // Create a raw staging table for CH with geometry in EPSG:2056
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _staging_ch_raw (
      code VARCHAR(10) NOT NULL,
      geometry GEOMETRY(Geometry, 2056),
      properties JSONB
    )
  `);
  await db.execute(sql`TRUNCATE _staging_ch_raw`);

  let featureCount = 0;
  const rawBatch: { code: string; geojson: string }[] = [];

  while (true) {
    const result = await source.read();
    if (result.done) break;
    featureCount++;

    const props = result.value.properties as Record<string, unknown>;
    const code = String(props.ZIP4 ?? "");
    if (!code || code === "undefined") continue;

    // Geometry is in EPSG:2056 — insert as-is, PostGIS will reproject
    rawBatch.push({
      code,
      geojson: JSON.stringify(result.value.geometry),
    });

    if (rawBatch.length >= BATCH_SIZE) {
      await insertCHRawBatch(rawBatch.splice(0, rawBatch.length));
    }
  }

  // Flush remaining
  if (rawBatch.length > 0) {
    await insertCHRawBatch(rawBatch);
  }

  log(`  Read ${featureCount} features from shapefile`);

  // Dissolve by ZIP4 code + reproject to EPSG:4326 in PostGIS
  log("  Dissolving + reprojecting in PostGIS...");
  const { rows: dissolved } = await db.execute(sql`
    INSERT INTO _staging_postal_codes (code, country, granularity, geometry, properties, source_release)
    SELECT
      code,
      'CH',
      '4digit',
      ST_Multi(ST_MakeValid(ST_Transform(
        ST_UnaryUnion(ST_Collect(geometry)),
        4326
      ))),
      jsonb_build_object('source', 'swisstopo'),
      'swisstopo-2026'
    FROM _staging_ch_raw
    GROUP BY code
    ON CONFLICT (country, granularity, code)
    DO UPDATE SET geometry = EXCLUDED.geometry, properties = EXCLUDED.properties, source_release = EXCLUDED.source_release
    RETURNING code
  `);

  await db.execute(sql`DROP TABLE IF EXISTS _staging_ch_raw`);

  log(`  Dissolved + reprojected into ${dissolved.length} CH PLZ polygons`);
  return dissolved.length;
}

async function insertCHRawBatch(
  batch: { code: string; geojson: string }[]
): Promise<void> {
  if (batch.length === 0) return;
  const values = batch
    .map(
      (r) =>
        `('${r.code}', ST_SetSRID(ST_GeomFromGeoJSON('${r.geojson.replace(/'/g, "''")}'), 2056))`
    )
    .join(",\n");

  await db.execute(
    sql.raw(`
      INSERT INTO _staging_ch_raw (code, geometry) VALUES ${values}
    `)
  );
}

// ---------------------------------------------------------------------------
// Insert staging batch (for DE which is already GeoJSON in EPSG:4326)
// ---------------------------------------------------------------------------
async function insertStagingBatch(
  features: GeoJSONFeature[],
  country: string,
  granularity: string
): Promise<void> {
  if (features.length === 0) return;

  const values = features
    .map((f) => {
      const code = String(f.properties?.code ?? "");
      const geojson = JSON.stringify(f.geometry).replace(/'/g, "''");
      return `('${code}', '${country}', '${granularity}', ST_SetSRID(ST_GeomFromGeoJSON('${geojson}'), 4326), '{}', 'postdirekt-2026')`;
    })
    .join(",\n");

  await db.execute(
    sql.raw(`
      INSERT INTO _staging_postal_codes (code, country, granularity, geometry, properties, source_release)
      VALUES ${values}
      ON CONFLICT (country, granularity, code) DO UPDATE
      SET geometry = EXCLUDED.geometry, properties = EXCLUDED.properties, source_release = EXCLUDED.source_release
    `)
  );
}

// ---------------------------------------------------------------------------
// Generate coarser granularities from finest level via PostGIS
// ---------------------------------------------------------------------------
async function generateCoarseGranularities(country: string): Promise<void> {
  const config = COARSE_CONFIG[country];
  if (!config) return;

  const { finest, levels } = config;

  // Increase statement timeout for heavy spatial unions (DE 1digit = union of ~800+ polygons)
  await db.execute(sql`SET statement_timeout = '300s'`);

  for (const level of levels) {
    const granularity = `${level}digit`;
    log(`  Generating ${country} ${granularity} from ${finest}...`);

    const { rows } = await db.execute(
      sql.raw(`
        INSERT INTO _staging_postal_codes (code, country, granularity, geometry, properties, source_release)
        SELECT
          LEFT(code, ${level}),
          '${country}',
          '${granularity}',
          ST_Multi(ST_MakeValid(ST_UnaryUnion(ST_Collect(geometry)))),
          jsonb_build_object('derived_from', '${finest}'),
          (SELECT source_release FROM _staging_postal_codes WHERE country = '${country}' AND granularity = '${finest}' LIMIT 1)
        FROM _staging_postal_codes
        WHERE country = '${country}' AND granularity = '${finest}'
        GROUP BY LEFT(code, ${level})
        ON CONFLICT (country, granularity, code) DO UPDATE
        SET geometry = EXCLUDED.geometry, properties = EXCLUDED.properties, source_release = EXCLUDED.source_release
        RETURNING code
      `)
    );

    log(`    → ${rows.length} ${granularity} polygons`);
  }

  // Reset statement timeout
  await db.execute(sql`SET statement_timeout = '60s'`);
}

// ---------------------------------------------------------------------------
// Merge staging → live postal_codes table
// ---------------------------------------------------------------------------
async function mergeStagingToLive(country: string): Promise<{
  upserted: number;
  deactivated: number;
}> {
  log(`  Merging ${country} staging → postal_codes...`);

  // Upsert all staged rows into live table
  const { rows: upserted } = await db.execute(
    sql.raw(`
      INSERT INTO postal_codes (code, country, granularity, geometry, properties, bbox, source_release, is_active, created_at, updated_at)
      SELECT
        s.code,
        s.country,
        s.granularity,
        ST_Multi(ST_CollectionExtract(ST_MakeValid(s.geometry), 3)),
        COALESCE(s.properties, '{}'::jsonb),
        to_jsonb(ARRAY[
          ST_XMin(ST_Envelope(s.geometry)),
          ST_YMin(ST_Envelope(s.geometry)),
          ST_XMax(ST_Envelope(s.geometry)),
          ST_YMax(ST_Envelope(s.geometry))
        ]),
        s.source_release,
        'true',
        NOW(),
        NOW()
      FROM _staging_postal_codes s
      WHERE s.country = '${country}'
      ON CONFLICT (country, granularity, code) DO UPDATE SET
        geometry = EXCLUDED.geometry,
        properties = EXCLUDED.properties,
        bbox = EXCLUDED.bbox,
        source_release = EXCLUDED.source_release,
        is_active = 'true',
        updated_at = NOW()
      RETURNING code
    `)
  );

  // Mark rows not in staging as inactive
  const { rows: deactivatedRows } = await db.execute(
    sql.raw(`
      UPDATE postal_codes
      SET is_active = 'false', updated_at = NOW()
      WHERE country = '${country}'
        AND is_active = 'true'
        AND NOT EXISTS (
          SELECT 1 FROM _staging_postal_codes s
          WHERE s.country = postal_codes.country
            AND s.granularity = postal_codes.granularity
            AND s.code = postal_codes.code
        )
      RETURNING code, granularity
    `)
  );

  return { upserted: upserted.length, deactivated: deactivatedRows.length };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFile(
  dir: string,
  ext: string,
  nameContains: string
): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const found = findFile(path.join(dir, entry.name), ext, nameContains);
      if (found) return found;
    } else if (
      entry.name.endsWith(ext) &&
      entry.name.toUpperCase().includes(nameContains.toUpperCase())
    ) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log(`=== DACH Geodata Import ===`);
  log(`Countries: ${COUNTRIES_TO_IMPORT.join(", ")}`);
  log(`Dry run: ${dryRun}`);
  log(`Skip coarse: ${skipCoarse}`);
  log("");

  try {
    // 1. Create staging table
    log("Creating staging table...");
    await ensureStagingTable();

    // 2. Fetch data for each country
    for (const country of COUNTRIES_TO_IMPORT) {
      log(`\n--- Importing ${country} ---`);
      let count: number;

      if (country === "DE") count = await fetchDE();
      else if (country === "AT") count = await fetchAT();
      else if (country === "CH") count = await fetchCH();
      else {
        log(`Unknown country: ${country}`);
        continue;
      }

      // Validate counts
      const expected = EXPECTED_COUNTS[country];
      if (expected && (count < expected.min || count > expected.max)) {
        log(
          `⚠️  WARNING: ${country} count ${count} outside expected range [${expected.min}, ${expected.max}]`
        );
      } else {
        log(`✅ ${country}: ${count} finest-level PLZ (within expected range)`);
      }

      // 3. Generate coarser granularities
      if (!skipCoarse) {
        log(`\nGenerating coarser granularities for ${country}...`);
        await generateCoarseGranularities(country);
      }

      // 4. Merge to live table
      if (dryRun) {
        log(`[DRY RUN] Would merge ${country} to live table`);
        // Show staging counts
        const { rows } = await db.execute(
          sql.raw(`
            SELECT granularity, COUNT(*) as count
            FROM _staging_postal_codes
            WHERE country = '${country}'
            GROUP BY granularity
            ORDER BY granularity
          `)
        );
        for (const row of rows) {
          const r = row as Record<string, unknown>;
          log(`  ${r.granularity}: ${r.count}`);
        }
      } else {
        const { upserted, deactivated } = await mergeStagingToLive(country);
        log(`✅ ${country}: ${upserted} upserted, ${deactivated} deactivated`);
      }
    }

    // 5. Final verification
    log("\n=== Final Verification ===");
    const { rows: finalCounts } = await db.execute(sql`
      SELECT country, granularity, COUNT(*) as count
      FROM postal_codes
      WHERE is_active = 'true'
      GROUP BY country, granularity
      ORDER BY country, granularity
    `);
    for (const row of finalCounts) {
      const r = row as Record<string, unknown>;
      log(`  ${r.country} ${r.granularity}: ${r.count}`);
    }

    // 6. Cleanup
    log("\nCleaning up staging table...");
    await dropStagingTable();

    log("\n✅ Import complete!");
  } catch (error) {
    log(`\n❌ Import failed: ${error}`);
    // Cleanup on error
    try {
      await dropStagingTable();
      await db.execute(sql`DROP TABLE IF EXISTS _staging_at_raw`);
      await db.execute(sql`DROP TABLE IF EXISTS _staging_ch_raw`);
    } catch {
      // ignore cleanup errors
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
