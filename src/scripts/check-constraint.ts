import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

async function check() {
  console.log("Checking database schema...\n");

  // First check what constraints exist
  const allConstraints = await db.execute(sql`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'area_layer_postal_codes'
  `);

  console.log("All constraints on area_layer_postal_codes:");
  for (const row of allConstraints.rows) {
    const c = row as any;
    console.log(`  - ${c.constraint_name}`);
  }

  // Check if the constraint was created
  const fkCheck = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_area_layer_postal_codes_layer_id'
      AND table_name = 'area_layer_postal_codes'
    ) as exists
  `);

  console.log("\nFK constraint exists:", (fkCheck.rows[0] as any).exists);

  process.exit(0);
}

check().catch((err) => {
  console.error("Error:", err.message);
  console.error(err.stack);
  process.exit(1);
});
