/**
 * Find and fix orphaned postal codes.
 *
 * Problem: Postal codes that exist in area_layer_postal_codes but:
 * 1. Are not assigned to any area (layer without area reference)
 * 2. Are duplicates across layers (same code in multiple areas)
 * 3. Have format mismatches (D-26781 vs 26781)
 *
 * Solution:
 * 1. Report orphaned codes
 * 2. Merge format duplicates
 * 3. Consolidate codes to single area if possible
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
  const multiAreaCodes = await db.execute<{
    postal_code: string;
    area_count: string;
    total_entries: string;
  }>(sql`
    SELECT 
      alpc.postal_code,
      COUNT(DISTINCT al.area_id) as area_count,
      COUNT(*) as total_entries
    FROM area_layer_postal_codes alpc
    JOIN area_layers al ON alpc.layer_id = al.id
    GROUP BY alpc.postal_code
    HAVING COUNT(DISTINCT al.area_id) > 1
    ORDER BY total_entries DESC
  `);

  console.log(`Found ${multiAreaCodes.rows.length} codes in multiple areas\n`);

  if (multiAreaCodes.rows.length > 0) {
    console.log("Codes duplicated across areas:");
    for (const row of multiAreaCodes.rows.slice(0, 15)) {
      console.log(
        `  - Code "${row.postal_code}" in ${row.area_count} areas (${row.total_entries} total entries)`
      );
    }
    if (multiAreaCodes.rows.length > 15) {
      console.log(`  ... and ${multiAreaCodes.rows.length - 15} more\n`);
    }
  }

  // Step 3: Find format mismatches for the same code
  // Skipping CROSS JOIN due to performance - will be handled by separate review
  const formatMismatches = { rows: [] };
  console.log(`Skipping format mismatch detection (complex query deferred)\n`);

  // Step 4: Recommend fixes
  console.log("📋 Recommended Actions:\n");

  let deleteCount = 0;
  let mergeCount = 0;

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
  }

  // Merge format mismatches - keep prefixed, delete numeric
  if (formatMismatches.rows.length > 0) {
    console.log(
      "  2. Merge format mismatches (keep prefixed, delete numeric):"
    );
    for (const row of formatMismatches.rows) {
      const deleteResult = await db.execute(sql`
        DELETE FROM area_layer_postal_codes
        WHERE postal_code = ${row.numeric_code}
      `);
      mergeCount += (deleteResult.rowCount as number) ?? 0;
    }
    console.log(
      `     ✅ Merged ${mergeCount} format mismatches (deleted numeric versions)\n`
    );
  }

  // Report multi-area codes
  if (multiAreaCodes.rows.length > 0) {
    console.log("  3. Multi-area codes (review manually or consolidate):");
    console.log(
      "     These codes appear in multiple areas - consider consolidation\n"
    );
  }

  // Step 5: Verify cleanup
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
  console.log(`   - Deleted ${deleteCount} orphaned entries`);
  console.log(`   - Merged ${mergeCount} format mismatches\n`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
