import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

async function verify() {
  console.log("✅ Verifying foreign key constraint added...\n");

  // Alternative check using pg_constraint
  const pgFks = await db.execute(sql`
    SELECT
      c.conname as constraint_name,
      a.attname as column_name
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'area_layer_postal_codes'
    AND c.contype = 'f'
  `);

  console.log("Foreign keys on area_layer_postal_codes:");
  if (pgFks.rows.length > 0) {
    for (const row of pgFks.rows) {
      const fk = row as any;
      console.log(`  ✅ ${fk.constraint_name} (column: ${fk.column_name})`);
    }
  } else {
    console.log("  ❌ No foreign key constraints found");
  }

  console.log("\n✅ Verification complete!");
  process.exit(0);
}

verify().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
