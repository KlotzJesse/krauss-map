import { sql } from "drizzle-orm";

import { pgClient } from "@/lib/db";

async function test() {
  console.log("Testing with raw PostgreSQL client...\n");

  const client = await pgClient();

  try {
    console.log("Checking for orphaned postal codes...");
    const orphaned = await client.query(`
      SELECT COUNT(*) as count
      FROM area_layer_postal_codes
      WHERE layer_id NOT IN (SELECT id FROM area_layers)
    `);

    console.log(`Found ${orphaned.rows[0].count} orphaned codes`);

    if (orphaned.rows[0].count === 0) {
      console.log("\n✅ No orphaned codes, safe to add constraint\n");

      console.log("Adding foreign key constraint...");
      const result = await client.query(`
        ALTER TABLE "area_layer_postal_codes" 
        ADD CONSTRAINT "fk_area_layer_postal_codes_layer_id" FOREIGN KEY ("layer_id") 
        REFERENCES "area_layers"("id") ON DELETE CASCADE
      `);

      console.log("✅ Constraint added successfully!");
      console.log("Command result:", result.command);
    } else {
      console.log("\n❌ Orphaned codes exist, cannot add constraint");
    }
  } catch (error: any) {
    console.log("❌ Error:", error.message);
    if (error.detail) console.log("  Detail:", error.detail);
    if (error.hint) console.log("  Hint:", error.hint);
  } finally {
    await client.end();
    process.exit(0);
  }
}

test().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
