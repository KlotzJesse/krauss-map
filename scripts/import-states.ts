import * as fs from "node:fs";
import * as path from "node:path";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

const AT_STATES: Record<string, string> = {
  "1": "Burgenland",
  "2": "Kärnten",
  "3": "Niederösterreich",
  "4": "Oberösterreich",
  "5": "Salzburg",
  "6": "Steiermark",
  "7": "Tirol",
  "8": "Vorarlberg",
  "9": "Wien",
};

// geo.admin.ch API: canton IDs map to official BFS canton numbers 1-26
const CH_CANTON_IDS = 26;

async function importATStates() {
  console.log("Importing AT states from kolmann.at Gemeinden data...");
  const extractDir = "/tmp/geodata-import-run/at_gemeinden";
  const jsonFile = fs
    .readdirSync(extractDir)
    .find((f: string) => f.endsWith(".json"));
  if (!jsonFile) throw new Error("No JSON file found");
  const data = JSON.parse(
    fs.readFileSync(path.join(extractDir, jsonFile), "utf8")
  );

  // Group features by first digit of iso (Bundesland)
  const stateGeoms: Record<string, object[]> = {};
  for (const f of data.features) {
    const iso = f.properties?.iso;
    if (!iso || !f.geometry) continue;
    const stateCode = String(iso)[0];
    if (!stateGeoms[stateCode]) stateGeoms[stateCode] = [];
    stateGeoms[stateCode].push(f.geometry);
  }

  console.log(
    "Found states:",
    Object.keys(stateGeoms)
      .sort()
      .map((k: string) => `${k}=${AT_STATES[k]}`)
      .join(", ")
  );

  // Set higher timeout for dissolve operations
  await db.execute(sql`SET statement_timeout = '120s'`);

  for (const [code, geometries] of Object.entries(stateGeoms)) {
    const name = AT_STATES[code];
    if (!name) {
      console.log(`  Skipping unknown code: ${code}`);
      continue;
    }

    // Create temp table for dissolving
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS _tmp_state_geoms (geom GEOMETRY(Geometry, 4326))`
    );
    await db.execute(sql`TRUNCATE _tmp_state_geoms`);

    // Insert all geometries in batches
    for (let i = 0; i < geometries.length; i += 50) {
      const chunk = geometries.slice(i, i + 50);
      const values = chunk
        .map(
          (g: object) =>
            `(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(g).replace(/'/g, "''")}'), 4326)))`
        )
        .join(",");
      await db.execute(
        sql.raw(`INSERT INTO _tmp_state_geoms (geom) VALUES ${values}`)
      );
    }

    // Dissolve and insert into states
    await db.execute(
      sql.raw(`
      INSERT INTO states (name, code, country, geometry, bbox, created_at, updated_at)
      SELECT 
        '${name.replace(/'/g, "''")}',
        'AT-${code}',
        'AT',
        ST_Multi(ST_MakeValid(ST_UnaryUnion(ST_Collect(ST_Buffer(geom, 0))))),
        to_jsonb(ARRAY[
          ST_XMin(ST_Envelope(ST_Collect(geom))),
          ST_YMin(ST_Envelope(ST_Collect(geom))),
          ST_XMax(ST_Envelope(ST_Collect(geom))),
          ST_YMax(ST_Envelope(ST_Collect(geom)))
        ]),
        NOW(),
        NOW()
      FROM _tmp_state_geoms
      ON CONFLICT (country, code) DO UPDATE SET
        geometry = EXCLUDED.geometry, bbox = EXCLUDED.bbox, updated_at = NOW()
    `)
    );

    console.log(
      `  ✅ ${name} (AT-${code}) — ${geometries.length} Gemeinden dissolved`
    );
  }

  await db.execute(sql`DROP TABLE IF EXISTS _tmp_state_geoms`);
  console.log("AT states imported!\n");
}

async function importCHCantons() {
  console.log(
    "Importing CH cantons from geo.admin.ch API (official swisstopo boundaries)..."
  );

  // Reset both sequences to avoid PK conflicts (table has identity + legacy serial seq)
  await db.execute(
    sql.raw(
      "SELECT setval('states_id_seq', GREATEST((SELECT MAX(id) FROM states), 1))"
    )
  );
  await db.execute(
    sql.raw(
      "SELECT setval('states_id_seq1', GREATEST((SELECT MAX(id) FROM states), 1))"
    )
  );

  let imported = 0;
  for (let cantonId = 1; cantonId <= CH_CANTON_IDS; cantonId++) {
    const url = `https://api3.geo.admin.ch/rest/services/api/MapServer/ch.swisstopo.swissboundaries3d-kanton-flaeche.fill/${cantonId}?returnGeometry=true&geometryFormat=geojson&sr=4326`;

    const resp = await fetch(url);
    if (!resp.ok) {
      console.log(`  ❌ Canton ${cantonId}: HTTP ${resp.status}`);
      continue;
    }

    const data = await resp.json();
    const feat = data.feature;
    const props = feat.properties || {};
    const name = String(props.name || "?");
    const ak = String(props.ak || "?");
    const geojson = JSON.stringify(feat.geometry).replace(/'/g, "''");

    await db.execute(
      sql.raw(`
      INSERT INTO states (name, code, country, geometry, bbox, created_at, updated_at)
      VALUES (
        '${name.replace(/'/g, "''")}',
        'CH-${ak}',
        'CH',
        ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON('${geojson}'), 4326))),
        to_jsonb(ARRAY[
          ST_XMin(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON('${geojson}'), 4326))),
          ST_YMin(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON('${geojson}'), 4326))),
          ST_XMax(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON('${geojson}'), 4326))),
          ST_YMax(ST_Envelope(ST_SetSRID(ST_GeomFromGeoJSON('${geojson}'), 4326)))
        ]),
        NOW(),
        NOW()
      )
      ON CONFLICT (country, code) DO UPDATE SET
        name = EXCLUDED.name,
        geometry = EXCLUDED.geometry,
        bbox = EXCLUDED.bbox,
        updated_at = NOW()
    `)
    );

    imported++;
    console.log(`  ✅ ${name} (CH-${ak})`);
  }

  console.log(`CH cantons imported: ${imported}/26\n`);
}

async function main() {
  try {
    await importATStates();
    await importCHCantons();

    // Final check
    const { rows } = await db.execute(sql`
      SELECT country, COUNT(*) as count FROM states GROUP BY country ORDER BY country
    `);
    console.log("Final state counts:");
    console.table(rows);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await db.execute(sql`DROP TABLE IF EXISTS _tmp_state_geoms`);
  }
  process.exit(0);
}

main();
