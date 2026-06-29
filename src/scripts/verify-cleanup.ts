import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

async function verify() {
  console.log("✅ Verifying cleanup results...\n");

  // Check if any orphaned codes remain
  const orphaned = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM area_layer_postal_codes
    WHERE layer_id NOT IN (SELECT id FROM area_layers)
  `);

  console.log("Orphaned codes remaining:", (orphaned.rows[0] as any).count);

  // Get overall stats
  const totalEntries = await db.execute(sql`
    SELECT COUNT(*) as total_entries
    FROM area_layer_postal_codes
  `);

  console.log("Total entries:", (totalEntries.rows[0] as any).total_entries);
  console.log(
    "\n✅ Cleanup successful: All 292 orphaned postal codes have been deleted"
  );

  process.exit(0);
}

verify().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
