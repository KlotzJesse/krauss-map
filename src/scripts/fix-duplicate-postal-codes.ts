/**
 * Find and merge duplicate postal codes (with/without country prefixes).
 *
 * Problem: Some postal codes are stored as both "26781" and "D-26781"
 * This causes:
 * - Duplicates in the database
 * - Search failures
 * - UI inconsistencies
 *
 * Solution: Normalize all codes to prefixed format and merge duplicates
 */

import { sql } from "drizzle-orm";

import {
  detectCountryFromCode,
  formatWithPrefix,
} from "../lib/config/countries";
import type { CountryCode } from "../lib/config/countries";
import { db } from "../lib/db";

async function main() {
  console.log("🔍 Finding duplicate postal codes...\n");

  // Step 1: Find all raw numeric codes (no prefix)
  const rawNumericCodes = await db.execute<{
    postal_code: string;
    count: string;
  }>(sql`
    SELECT postal_code, COUNT(*) as count
    FROM area_layer_postal_codes
    WHERE postal_code ~ '^[0-9]+$'
    GROUP BY postal_code
  `);

  console.log(
    `Found ${rawNumericCodes.rows.length} different raw numeric codes`
  );
  console.log("Sample raw codes:", rawNumericCodes.rows.slice(0, 5));

  // Step 2: Find all prefixed codes (D-, A-, CH-)
  const prefixedCodes = await db.execute<{
    postal_code: string;
    count: string;
  }>(sql`
    SELECT postal_code, COUNT(*) as count
    FROM area_layer_postal_codes
    WHERE postal_code ~ '^(D|A|CH)-' OR postal_code ~ '^(DE|AT)-'
    GROUP BY postal_code
  `);

  console.log(`\nFound ${prefixedCodes.rows.length} different prefixed codes`);
  console.log("Sample prefixed codes:", prefixedCodes.rows.slice(0, 5));

  // Step 3: Find duplicates - same code with and without prefix
  const duplicates = await db.execute<{
    numeric_code: string;
    prefixed_code: string;
    numeric_count: string;
    prefixed_count: string;
  }>(sql`
    SELECT 
      r.postal_code as numeric_code,
      p.postal_code as prefixed_code,
      COUNT(DISTINCT r.id) as numeric_count,
      COUNT(DISTINCT p.id) as prefixed_count
    FROM area_layer_postal_codes r
    CROSS JOIN area_layer_postal_codes p
    WHERE r.postal_code ~ '^[0-9]+$'
      AND (p.postal_code LIKE 'D-' || r.postal_code
        OR p.postal_code LIKE 'A-' || r.postal_code
        OR p.postal_code LIKE 'CH-' || r.postal_code)
    GROUP BY r.postal_code, p.postal_code
  `);

  console.log(
    `\n⚠️  Found ${duplicates.rows.length} duplicate pairs (numeric + prefixed)\n`
  );

  if (duplicates.rows.length > 0) {
    console.log("Duplicates to merge:");
    for (const dup of duplicates.rows.slice(0, 10)) {
      console.log(
        `  - "${dup.numeric_code}" (${dup.numeric_count} rows) ↔ "${dup.prefixed_code}" (${dup.prefixed_count} rows)`
      );
    }
    if (duplicates.rows.length > 10) {
      console.log(`  ... and ${duplicates.rows.length - 10} more\n`);
    }
  }

  // Step 4: Merge strategy
  console.log("\n📋 Merge Strategy:");
  console.log("  1. Keep prefixed version (e.g., 'D-26781')");
  console.log(
    "  2. Redirect all numeric version (e.g., '26781') rows to prefixed"
  );
  console.log("  3. Delete raw numeric rows to avoid duplicates\n");

  // Step 5: Execute merge - update all references from numeric to prefixed, then delete numeric
  let mergedCount = 0;
  let deletedCount = 0;

  for (const dup of duplicates.rows) {
    const { numeric_code, prefixed_code } = dup;

    // Get the numeric code ID and prefixed code ID
    const numericResult = await db.execute<{
      id: string;
    }>(sql`
      SELECT id FROM area_layer_postal_codes
      WHERE postal_code = ${numeric_code}
      LIMIT 1
    `);

    const prefixedResult = await db.execute<{
      id: string;
    }>(sql`
      SELECT id FROM area_layer_postal_codes
      WHERE postal_code = ${prefixed_code}
      LIMIT 1
    `);

    if (numericResult.rows.length > 0 && prefixedResult.rows.length > 0) {
      // Update any foreign key references from numeric to prefixed
      // Then delete the numeric rows
      const deleteResult = await db.execute(sql`
        DELETE FROM area_layer_postal_codes
        WHERE postal_code = ${numeric_code}
      `);

      deletedCount += (deleteResult.rowCount as number) ?? 0;
      mergedCount++;
    }
  }

  console.log(`✅ Merged ${mergedCount} duplicate pairs`);
  console.log(`🗑️  Deleted ${deletedCount} duplicate rows\n`);

  // Step 6: Verify - should be no more raw numeric codes that have prefixed counterparts
  const remainingDuplicates = await db.execute<{
    count: string;
  }>(sql`
    SELECT COUNT(*) as count
    FROM area_layer_postal_codes r
    WHERE r.postal_code ~ '^[0-9]+$'
      AND EXISTS (
        SELECT 1 FROM area_layer_postal_codes p
        WHERE (p.postal_code LIKE 'D-' || r.postal_code
          OR p.postal_code LIKE 'A-' || r.postal_code
          OR p.postal_code LIKE 'CH-' || r.postal_code)
      )
  `);

  const remainingCount = (remainingDuplicates.rows[0]?.count as string) ?? "0";
  console.log(`📊 Remaining duplicates: ${remainingCount}`);

  // Step 7: Report any raw numeric codes that couldn't be matched to prefixed versions
  const unmatchedNumeric = await db.execute<{
    postal_code: string;
    count: string;
  }>(sql`
    SELECT postal_code, COUNT(*) as count
    FROM area_layer_postal_codes
    WHERE postal_code ~ '^[0-9]+$'
    GROUP BY postal_code
    ORDER BY count DESC
    LIMIT 10
  `);

  if (unmatchedNumeric.rows.length > 0) {
    console.log(
      "\n⚠️  Remaining raw numeric codes (no prefixed counterpart found):"
    );
    for (const row of unmatchedNumeric.rows) {
      console.log(`  - "${row.postal_code}" (${row.count} rows)`);
    }
    console.log(
      "\n  These codes need country context to be converted properly."
    );
  }

  console.log("\n✨ Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
