/**
 * Recover postal codes from create_layer change events.
 * The original reconstruct script only processed entity_type='postal_code' changes
 * but missed create_layer events (entity_type='layer') which contain postalCodes in change_data.
 */

import "dotenv/config";
import { Pool } from "pg";

const COUNTRY_TO_PREFIX: Record<string, string> = {
  DE: "D",
  AT: "A",
  CH: "CH",
};

function normalizeCode(code: string, countryPrefix: string): string {
  if (code.includes("-")) return code;
  return `${countryPrefix}-${code}`;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // Find all create_layer changes with postal codes that aren't yet in the DB
    const { rows: createLayerChanges } = await client.query<{
      area_id: number;
      area_name: string;
      country: string;
      layer_id: number;
      layer_name: string;
      version_number: number;
      change_data: { postalCodes?: string[] };
      existing_count: number;
    }>(
      `SELECT
        ac.area_id,
        a.name as area_name,
        a.country,
        ac.entity_id as layer_id,
        al.name as layer_name,
        ac.version_number,
        ac.change_data,
        (SELECT COUNT(*) FROM area_layer_postal_codes alpc WHERE alpc.layer_id = ac.entity_id) as existing_count
      FROM area_changes ac
      JOIN areas a ON a.id = ac.area_id
      JOIN area_layers al ON al.id = ac.entity_id
      WHERE ac.change_type = 'create_layer'
        AND ac.entity_type = 'layer'
        AND (ac.is_undone IS NULL OR ac.is_undone = 'false')
        AND jsonb_array_length(ac.change_data->'postalCodes') > 0
      ORDER BY ac.area_id, ac.entity_id`
    );

    console.log(`Found ${createLayerChanges.length} create_layer events with postal codes\n`);

    let totalInserted = 0;
    const layersSeen = new Set<number>();

    for (const row of createLayerChanges) {
      const layerId = row.layer_id;
      
      // If we've already processed this layer (multiple create_layer events), skip
      if (layersSeen.has(layerId)) {
        console.log(`  ⚠️  Layer ${layerId} '${row.layer_name}' has duplicate create_layer, skipping`);
        continue;
      }
      layersSeen.add(layerId);

      const existingCount = Number(row.existing_count);
      if (existingCount > 0) {
        console.log(
          `  ✓ Layer ${layerId} '${row.layer_name}' (area ${row.area_id} '${row.area_name}'): already has ${existingCount} codes, skipping`
        );
        continue;
      }

      const countryPrefix = COUNTRY_TO_PREFIX[row.country] ?? row.country;
      const rawCodes: string[] = row.change_data.postalCodes ?? [];
      const codes = new Set(rawCodes.map((c) => normalizeCode(c.trim(), countryPrefix)).filter(c => c.length <= 10));

      if (codes.size === 0) continue;

      const values: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const code of codes) {
        values.push(`($${idx}, $${idx + 1})`);
        params.push(layerId, code);
        idx += 2;
      }

      await client.query(
        `INSERT INTO area_layer_postal_codes (layer_id, postal_code) VALUES ${values.join(", ")}
         ON CONFLICT (layer_id, postal_code) DO NOTHING`,
        params
      );

      console.log(
        `  ✅ Layer ${layerId} '${row.layer_name}' (area ${row.area_id} '${row.area_name}'): ${codes.size} codes inserted`
      );
      totalInserted += codes.size;
    }

    const { rows: finalCnt } = await client.query(
      `SELECT COUNT(*) as n FROM area_layer_postal_codes`
    );
    console.log(`\n✅ Done! Inserted ${totalInserted} new codes.`);
    console.log(`   Total in DB now: ${finalCnt[0].n}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
