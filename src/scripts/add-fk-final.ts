import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

async function addForeignKeyConstraint() {
  console.log(
    "🔄 Adding foreign key constraint to prevent orphaned postal codes...\n"
  );

  try {
    // Check if constraint already exists
    console.log("1️⃣  Checking if constraint already exists...");
    const constraintCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'area_layer_postal_codes'
        AND constraint_name = 'fk_area_layer_postal_codes_layer_id'
      ) as exists
    `);

    const exists = (constraintCheck.rows[0] as any).exists;

    if (exists) {
      console.log("   ✅ Constraint already exists!\n");
      console.log("✅ Foreign key constraint is active!");
      process.exit(0);
    }

    console.log("   ❌ Constraint does not exist, adding...\n");

    // Add the constraint
    console.log("2️⃣  Adding foreign key constraint...");
    try {
      await db.execute(sql`
        ALTER TABLE area_layer_postal_codes
        ADD CONSTRAINT fk_area_layer_postal_codes_layer_id
        FOREIGN KEY (layer_id)
        REFERENCES area_layers(id)
        ON DELETE CASCADE
      `);

      console.log("   ✅ Constraint added successfully!\n");
    } catch (e: any) {
      if (
        e.message.includes("already exists") ||
        e.message.includes("duplicate")
      ) {
        console.log("   ⚠️  Constraint already exists (from concurrent add)\n");
      } else {
        throw e;
      }
    }

    // Verify it was added
    console.log("3️⃣  Verifying constraint was added...");
    const verification = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'area_layer_postal_codes'
        AND constraint_name = 'fk_area_layer_postal_codes_layer_id'
      ) as exists
    `);

    if ((verification.rows[0] as any).exists) {
      console.log("   ✅ Constraint verified!\n");
      console.log(
        "✅ Foreign key constraint successfully added to prevent future orphaned postal codes"
      );
    } else {
      console.log("   ❌ Constraint not found after addition");
      console.log("⚠️  Constraint may not have been applied");
    }

    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

addForeignKeyConstraint();
