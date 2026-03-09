import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";

async function fixSequences() {
  try {
    console.log("Fixing PostgreSQL sequences...");

    // Fix area_layer_postal_codes sequence
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('area_layer_postal_codes', 'id'),
        COALESCE((SELECT MAX(id) FROM area_layer_postal_codes), 1),
        true
      );
    `);
    console.log("✓ Fixed area_layer_postal_codes sequence");

    // Fix area_layers sequence
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('area_layers', 'id'),
        COALESCE((SELECT MAX(id) FROM area_layers), 1),
        true
      );
    `);
    console.log("✓ Fixed area_layers sequence");

    // Fix areas sequence
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('areas', 'id'),
        COALESCE((SELECT MAX(id) FROM areas), 1),
        true
      );
    `);
    console.log("✓ Fixed areas sequence");

    console.log("\n✅ All sequences fixed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error fixing sequences:", error);
    process.exit(1);
  }
}

fixSequences();
