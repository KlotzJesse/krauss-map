/**
 * Migration: Normalize area_layer_postal_codes to stored-format prefixes.
 *
 * Before: postalCode = "3800"  (raw numeric, ambiguous for 4-digit AT/CH codes)
 * After:  postalCode = "CH-3800" / "A-1010" / "D-12345"
 *
 * Phase 1: Populate postalCodeId FK using the area's country as hint for
 *          ambiguous 4-digit codes.
 * Phase 2: Rewrite postalCode string to stored format using the resolved FK.
 *
 * Run once: bun run src/scripts/migrate-postal-code-format.ts
 */

import { sql } from "drizzle-orm";

import { db } from "../lib/db";

async function migrate() {
  console.log("Starting postal code format migration…");

  // Phase 1: Populate postalCodeId for rows that still have raw numeric codes.
  // Priority: area's own country first (for 4-digit overlap), then DE, AT, CH.
  const phase1 = await db.execute(sql`
    UPDATE area_layer_postal_codes alpc
    SET postal_code_id = (
      SELECT pc.id
      FROM postal_codes pc
      JOIN area_layers al ON al.id = alpc.layer_id
      JOIN areas a ON a.id = al.area_id
      WHERE pc.code = alpc.postal_code
        AND pc.granularity = a.granularity
        AND pc.is_active = 'true'
      ORDER BY
        CASE WHEN pc.country = a.country THEN 0 ELSE 1 END,
        CASE pc.country WHEN 'DE' THEN 0 WHEN 'AT' THEN 1 WHEN 'CH' THEN 2 ELSE 3 END
      LIMIT 1
    )
    WHERE alpc.postal_code_id IS NULL
      AND alpc.postal_code ~ '^[0-9]+$'
  `);
  console.log(
    `Phase 1 complete — postalCodeId populated for ${(phase1 as { rowCount?: number }).rowCount ?? "?"} rows`
  );

  // Phase 2: Rewrite postalCode to stored format using the now-resolved FK.
  const phase2 = await db.execute(sql`
    UPDATE area_layer_postal_codes alpc
    SET postal_code = CASE pc.country
      WHEN 'DE' THEN 'D-'  || pc.code
      WHEN 'AT' THEN 'A-'  || pc.code
      WHEN 'CH' THEN 'CH-' || pc.code
      ELSE pc.code
    END
    FROM postal_codes pc
    WHERE pc.id = alpc.postal_code_id
      AND alpc.postal_code ~ '^[0-9]+$'
  `);
  console.log(
    `Phase 2 complete — postalCode format updated for ${(phase2 as { rowCount?: number }).rowCount ?? "?"} rows`
  );

  // Verify: any remaining raw numeric codes?
  const remaining = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM area_layer_postal_codes
    WHERE postal_code ~ '^[0-9]+$'
  `);
  const count = (remaining.rows[0] as { cnt: string }).cnt;
  if (count !== "0") {
    console.warn(
      `⚠ ${count} rows still have raw numeric codes (no matching postal_code found — check country/granularity)`
    );
  } else {
    console.log("✓ All rows migrated to stored format");
  }

  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
