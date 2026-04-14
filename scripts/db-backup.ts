import * as fs from "fs";

import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = `./backups/${timestamp}`;
  fs.mkdirSync(backupDir, { recursive: true });

  const tables = [
    "postal_codes",
    "states",
    "areas",
    "area_layers",
    "area_layer_postal_codes",
    "area_versions",
    "area_changes",
    "area_undo_stacks",
  ];

  for (const table of tables) {
    try {
      // For geometry tables, convert to text
      const hasGeom = ["postal_codes", "states"].includes(table);
      const geomSelect = hasGeom
        ? `SELECT *, ST_AsGeoJSON(geometry) as geometry_geojson FROM ${table}`
        : `SELECT * FROM ${table}`;

      const { rows } = await db.execute(sql.raw(geomSelect));
      const file = `${backupDir}/${table}.json`;
      fs.writeFileSync(file, JSON.stringify(rows, null, 2));
      console.log(`✅ ${table}: ${rows.length} rows → ${file}`);
    } catch (e: any) {
      console.error(`❌ ${table}: ${e.message}`);
    }
  }

  // Also backup schema info
  const { rows: schemaInfo } = await db.execute(sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name NOT LIKE 'spatial_%'
    ORDER BY table_name, ordinal_position
  `);
  fs.writeFileSync(
    `${backupDir}/schema_info.json`,
    JSON.stringify(schemaInfo, null, 2)
  );
  console.log(`\n✅ Schema info saved`);
  console.log(`\nBackup complete: ${backupDir}`);
  process.exit(0);
}
backup();
