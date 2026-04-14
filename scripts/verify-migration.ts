import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";

async function verify() {
  // Add the states constraint if missing
  await db
    .execute(sql`
    DO $$ BEGIN
      ALTER TABLE "states" ADD CONSTRAINT "states_country_code_unique" UNIQUE("country","code");
    EXCEPTION WHEN duplicate_object THEN 
      RAISE NOTICE 'constraint already exists';
    END $$
  `)
    .catch(() => console.log("  states constraint already exists"));

  // Check columns
  const { rows: cols } = await db.execute(sql`
    SELECT table_name, column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND column_name IN ('country', 'is_active', 'source_release', 'postal_code_id')
    ORDER BY table_name, column_name
  `);
  console.log("New columns:");
  for (const c of cols) {
    const col = c as any;
    console.log(
      `  ${col.table_name}.${col.column_name}: ${col.data_type} default=${col.column_default} nullable=${col.is_nullable}`
    );
  }

  // Check constraints
  const { rows: constraints } = await db.execute(sql`
    SELECT conname, conrelid::regclass as table_name, contype
    FROM pg_constraint
    WHERE conname LIKE '%country%' OR conname LIKE '%postal_code_id%'
    ORDER BY conname
  `);
  console.log("\nCountry/FK constraints:");
  for (const c of constraints) {
    const con = c as any;
    console.log(
      `  ${con.table_name}: ${con.conname} (${con.contype === "u" ? "UNIQUE" : con.contype === "f" ? "FK" : con.contype})`
    );
  }

  // Verify data
  const {
    rows: [pc],
  } = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM postal_codes WHERE country = 'DE'`
  );
  const {
    rows: [st],
  } = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM states WHERE country = 'DE'`
  );
  const {
    rows: [ar],
  } = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM areas WHERE country = 'DE'`
  );
  console.log(`\nData verification:`);
  console.log(`  postal_codes (country=DE): ${(pc as any).cnt}`);
  console.log(`  states (country=DE): ${(st as any).cnt}`);
  console.log(`  areas (country=DE): ${(ar as any).cnt}`);

  process.exit(0);
}
verify();
