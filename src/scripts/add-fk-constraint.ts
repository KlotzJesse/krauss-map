import { Pool } from "pg";

async function test() {
  console.log("Testing foreign key constraint with raw pg...\n");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const client = await pool.connect();

  try {
    console.log("Checking for orphaned postal codes...");
    const orphaned = await client.query(
      `
      SELECT COUNT(*) as count
      FROM area_layer_postal_codes
      WHERE layer_id NOT IN (SELECT id FROM area_layers)
    `
    );

    const orphanedCount = parseInt((orphaned.rows[0] as any).count);
    console.log(`Found ${orphanedCount} orphaned codes`);

    if (orphanedCount === 0) {
      console.log("\n✅ No orphaned codes, safe to add constraint\n");

      console.log("Adding foreign key constraint...");
      try {
        const result = await client.query(
          `
          ALTER TABLE "area_layer_postal_codes" 
          ADD CONSTRAINT "fk_area_layer_postal_codes_layer_id" FOREIGN KEY ("layer_id") 
          REFERENCES "area_layers"("id") ON DELETE CASCADE
        `
        );

        console.log("✅ Constraint added successfully!");
      } catch (e: any) {
        // Check if constraint already exists
        if (
          e.message.includes("already exists") ||
          e.message.includes("duplicate")
        ) {
          console.log("⚠️  Constraint already exists");
        } else {
          throw e;
        }
      }
    } else {
      console.log("\n❌ Cannot add constraint - fix orphaned codes first");
    }

    // Verify constraint exists
    console.log("\nVerifying constraint...");
    const verify = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'area_layer_postal_codes'
      AND constraint_name = 'fk_area_layer_postal_codes_layer_id'
    `);

    if (verify.rows.length > 0) {
      console.log("✅ Foreign key constraint is active!");
    } else {
      console.log("❌ Constraint not found");
    }
  } catch (error: any) {
    console.log("❌ Error:", error.message);
    console.log("Code:", error.code);
    if (error.detail) console.log("Detail:", error.detail);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

test().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
