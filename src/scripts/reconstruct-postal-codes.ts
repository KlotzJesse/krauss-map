/**
 * Reconstruct area_layer_postal_codes from:
 * 1. area_versions snapshots (baseline per area/layer)
 * 2. area_changes (incremental add/remove on top of snapshot)
 *
 * Country prefix mapping: DE → "D-", AT → "A-", CH → "CH-"
 */

import "dotenv/config";
import { Pool } from "pg";

const COUNTRY_TO_PREFIX: Record<string, string> = {
  DE: "D",
  AT: "A",
  CH: "CH",
};

function normalizeCode(code: string, countryPrefix: string): string {
  // Already has a prefix (contains "-")
  if (code.includes("-")) return code;
  // Raw numeric code — add country prefix
  return `${countryPrefix}-${code}`;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log("🔍 Starting reconstruction of area_layer_postal_codes...\n");

    // Load all areas with country
    const { rows: areas } = await client.query<{
      id: number; name: string; country: string;
    }>(`SELECT id, name, country FROM areas ORDER BY id`);

    console.log(`Found ${areas.length} areas\n`);

    // For each area, compute the set of (layerId, code) pairs
    const totalInserted = { layers: 0, codes: 0 };
    const unrecoverableAreas: string[] = [];

    for (const area of areas) {
      const countryPrefix = COUNTRY_TO_PREFIX[area.country] ?? area.country;

      // Get all layers for this area
      const { rows: layers } = await client.query<{ id: number }>(
        `SELECT id FROM area_layers WHERE area_id = $1`, [area.id]
      );
      if (layers.length === 0) continue;
      const layerIds = new Set(layers.map(l => l.id));

      // Build per-layer code sets, starting from snapshot
      const layerCodes = new Map<number, Set<string>>();
      for (const { id } of layers) layerCodes.set(id, new Set());

      // --- Step 1: Load the most recent snapshot that has postal codes ---
      const { rows: snapshots } = await client.query<{
        version_number: number; snapshot: any; created_at: string;
      }>(
        `SELECT version_number, snapshot, created_at
         FROM area_versions
         WHERE area_id = $1
           AND jsonb_array_length(snapshot->'layers') > 0
         ORDER BY version_number DESC
         LIMIT 1`,
        [area.id]
      );

      let snapshotVersion = 0;

      if (snapshots.length > 0) {
        const { version_number, snapshot } = snapshots[0];
        snapshotVersion = version_number;

        const snapshotLayers: Array<{ id: number; postalCodes: string[] }> =
          snapshot.layers ?? [];

        for (const sl of snapshotLayers) {
          if (!layerIds.has(sl.id)) continue; // layer was deleted
          const codes = layerCodes.get(sl.id)!;
          for (const raw of sl.postalCodes ?? []) {
            codes.add(normalizeCode(raw, countryPrefix));
          }
        }

        const totalSnap = [...layerCodes.values()].reduce((s, c) => s + c.size, 0);
        console.log(
          `  Area ${area.id} '${area.name}': snapshot v${version_number} → ${totalSnap} codes`
        );
      }

      // --- Step 2: Apply non-undone changes ON TOP of the snapshot ---
      // Changes with version_number >= snapshotVersion (the snapshot is the state
      // AT THE START of snapshotVersion, so we apply all changes for that version too)
      const { rows: changes } = await client.query<{
        change_type: string; change_data: any; sequence_number: number; version_number: number;
      }>(
        `SELECT change_type, change_data, sequence_number, version_number
         FROM area_changes
         WHERE area_id = $1
           AND entity_type = 'postal_code'
           AND (is_undone IS NULL OR is_undone = 'false')
           AND version_number >= $2
         ORDER BY version_number ASC, sequence_number ASC`,
        [area.id, snapshotVersion]
      );

      for (const change of changes) {
        const data = change.change_data;

        if (change.change_type === "add_postal_codes") {
          const layerId = data.layerId as number;
          if (!layerCodes.has(layerId)) continue;
          const codes = layerCodes.get(layerId)!;
          for (const raw of data.postalCodes ?? []) {
            codes.add(normalizeCode(String(raw), countryPrefix));
          }
        } else if (change.change_type === "remove_postal_codes") {
          // Can be single layerId or array layerIds
          const targets: number[] = data.layerIds ?? (data.layerId ? [data.layerId] : []);
          for (const layerId of targets) {
            if (!layerCodes.has(layerId)) continue;
            const codes = layerCodes.get(layerId)!;
            for (const raw of data.postalCodes ?? []) {
              codes.delete(normalizeCode(String(raw), countryPrefix));
            }
          }
        }
      }

      // --- Step 3: Count what we recovered ---
      const totalCodes = [...layerCodes.values()].reduce((s, c) => s + c.size, 0);

      if (totalCodes === 0 && changes.length === 0 && snapshots.length === 0) {
        unrecoverableAreas.push(`area ${area.id} '${area.name}'`);
        continue;
      }

      // --- Step 4: Insert into area_layer_postal_codes ---
      let areaInserted = 0;
      for (const [layerId, codes] of layerCodes) {
        if (codes.size === 0) continue;
        totalInserted.layers++;
        areaInserted += codes.size;

        // Batch insert
        const values: string[] = [];
        const params: any[] = [];
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
      }

      if (areaInserted > 0 || changes.length > 0) {
        console.log(
          `  Area ${area.id} '${area.name}': inserted ${areaInserted} codes across ${[...layerCodes.values()].filter(c => c.size > 0).length} layers`
        );
        totalInserted.codes += areaInserted;
      }
    }

    console.log("\n📊 Reconstruction complete!");
    console.log(`  Total codes inserted: ${totalInserted.codes}`);
    console.log(`  Total layers populated: ${totalInserted.layers}`);

    if (unrecoverableAreas.length > 0) {
      console.log(`\n⚠️  Unrecoverable (no data source):`);
      for (const a of unrecoverableAreas) console.log(`   - ${a}`);
    }

    // Final verification
    const { rows: finalCount } = await client.query(
      `SELECT COUNT(*) as n FROM area_layer_postal_codes`
    );
    console.log(`\n✅ area_layer_postal_codes now has ${finalCount[0].n} entries`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Fatal:", e.message, e.detail ?? "");
  process.exit(1);
});
