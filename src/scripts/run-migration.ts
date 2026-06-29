import * as fs from "fs";
import * as path from "path";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

async function runMigration() {
  const migrationPath = path.join(
    process.cwd(),
    "drizzle/0017_add_foreign_key_layer_id.sql"
  );
  const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

  console.log("🔄 Applying migration: 0017_add_foreign_key_layer_id.sql\n");

  try {
    // Split the migration into individual statements, removing comments
    let statements = migrationSQL
      .split(";")
      .map((s) => {
        // Remove comment lines and trim
        return s
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim();
      })
      .filter((s) => s.length > 0);

    console.log(`Found ${statements.length} statements to execute\n`);

    for (const statement of statements) {
      console.log(
        `Executing: ${statement.substring(0, 80).replace(/\n/g, " ")}...`
      );
      try {
        const result = await db.execute(sql.raw(statement));
        console.log(`  ✅ Success`);
      } catch (e: any) {
        const errorMsg = e.message.toLowerCase();
        // Ignore "already exists" errors
        if (
          errorMsg.includes("already exists") ||
          errorMsg.includes("duplicate")
        ) {
          console.log(`  ⚠️  Constraint already exists (skipping)`);
        } else {
          console.log(`  ❌ Error: ${e.message}`);
          throw e;
        }
      }
    }

    console.log("\n✅ Migration applied successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", (error as any).message);
    process.exit(1);
  }
}

runMigration();
