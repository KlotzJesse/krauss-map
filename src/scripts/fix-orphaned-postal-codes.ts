/**
 * Find and fix orphaned postal codes.
 *
 * Problem: Postal codes that exist in area_layer_postal_codes but:
 * 1. Reference a layer that no longer exists (layer was deleted without cascade)
 *
 * Note: Postal codes being in multiple areas/layers is EXPECTED and correct.
 * Each area/project can independently assign any postal code to its layers.
 *
 * Solution:
 * 1. Delete postal code entries that reference deleted layers
 */

import { sql } from "drizzle-orm";

import { db } from "../lib/db";

async function main() {
  console.log("🔍 Finding orphaned postal codes...\n");

  // Step 1: Find postal codes not assigned to any area
  const orphanedByArea = await db.execute<{
    postal_code: string;
    layer_id: string;
    count: string;
  }>(sql`
    SELECT 
      alpc.postal_code,
      alpc.layer_id,
      COUNT(*) as count
    FROM area_layer_postal_codes alpc
    LEFT JOIN area_layers al ON alpc.layer_id = al.id
    WHERE al.id IS NULL
    GROUP BY alpc.postal_code, alpc.layer_id
  `);

  console.log(
    `Found ${orphanedByArea.rows.length} postal codes with missing layer references\n`
  );

  if (orphanedByArea.rows.length > 0) {
    console.log("Sample orphaned codes (by layer):");
    for (const row of orphanedByArea.rows.slice(0, 10)) {
      console.log(
        `  - Code "${row.postal_code}" (${row.count} rows) in deleted layer ${row.layer_id}`
      );
    }
    if (orphanedByArea.rows.length > 10) {
      console.log(`  ... and ${orphanedByArea.rows.length - 10} more\n`);
    }
  }

  // Step 2: Find postal codes assigned to multiple areas (potential duplicates)
  // Step 2: Recommend fixes
  console.log("📋 Recommended Actions:\n");

  let deleteCount = 0;

  // Delete orphaned codes (no parent layer)
  if (orphanedByArea.rows.length > 0) {
    console.log("  1. Delete orphaned postal codes (no parent layer):");
    for (const row of orphanedByArea.rows) {
      const deleteResult = await db.execute(sql`
        DELETE FROM area_layer_postal_codes
        WHERE postal_code = ${row.postal_code}
          AND layer_id = ${row.layer_id}
      `);
      deleteCount += (deleteResult.rowCount as number) ?? 0;
    }
    console.log(`     ✅ Deleted ${deleteCount} orphaned entries\n`);
  } else {
    console.log("  ✅ No orphaned postal codes found — database is clean\n");
  }

  // Note: Multi-area codes are intentional and expected
  console.log("  ℹ️  Note: Postal codes in multiple areas is by design (different projects can share codes)\n");

  // Step 3: Verify cleanup
  console.log("📊 Post-cleanup Statistics:\n");

  const totalCodes = await db.execute<{
    count: string;
  }>(sql`
    SELECT COUNT(DISTINCT postal_code) as count
    FROM area_layer_postal_codes
  `);

  const totalEntries = await db.execute<{
    count: string;
  }>(sql`
    SELECT COUNT(*) as count
    FROM area_layer_postal_codes
  `);

  const stillOrphaned = await db.execute<{
    count: string;
  }>(sql`
    SELECT COUNT(*) as count
    FROM area_layer_postal_codes alpc
    LEFT JOIN area_layers al ON alpc.layer_id = al.id
    WHERE al.id IS NULL
  `);

  console.log(
    `  Total unique postal codes: ${(totalCodes.rows[0]?.count as string) ?? "0"}`
  );
  console.log(
    `  Total postal code entries: ${(totalEntries.rows[0]?.count as string) ?? "0"}`
  );
  console.log(
    `  Still orphaned: ${(stillOrphaned.rows[0]?.count as string) ?? "0"}`
  );

  console.log("\n✨ Cleanup complete!");
  console.log(`   - Deleted ${deleteCount} orphaned entries\n`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
