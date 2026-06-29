import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

async function test() {
  console.log("Testing foreign key constraint addition...\n");

  try {
    console.log("Attempting to add foreign key constraint...");
    const result = await db.execute(
      sql`ALTER TABLE "area_layer_postal_codes" 
      ADD CONSTRAINT "fk_area_layer_postal_codes_layer_id" FOREIGN KEY ("layer_id") 
      REFERENCES "area_layers"("id") ON DELETE CASCADE`
    );
    console.log("✅ Constraint added successfully");
    console.log("Result:", result);
  } catch (error: any) {
    console.log("❌ Error details:");
    console.log("  Message:", error.message);
    console.log("  Code:", error.code);
    console.log("  Detail:", error.detail);
    console.log("  Hint:", error.hint);

    // Check if constraint exists
    try {
      const checkExists = await db.execute(sql`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'area_layer_postal_codes'
        AND constraint_name = 'fk_area_layer_postal_codes_layer_id'
      `);

      if (checkExists.rows.length > 0) {
        console.log(
          "\n✅ Constraint actually exists! The error might be misleading."
        );
      } else {
        console.log("\n❌ Constraint does not exist.");
      }
    } catch (e) {
      console.log("\nCould not check constraint existence");
    }
  }

  process.exit(0);
}

test().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
