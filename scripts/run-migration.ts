import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";

async function migrate() {
  console.log("Running migration 0010...");

  // 1. Drop old unique constraint on states
  await db.execute(
    sql`ALTER TABLE "states" DROP CONSTRAINT IF EXISTS "states_code_unique"`
  );
  console.log("  ✓ Dropped states_code_unique");

  // 2. Add new columns (with defaults, safe for existing data)
  await db.execute(
    sql`ALTER TABLE "area_layer_postal_codes" ADD COLUMN IF NOT EXISTS "postal_code_id" integer`
  );
  console.log("  ✓ Added area_layer_postal_codes.postal_code_id");

  await db.execute(
    sql`ALTER TABLE "areas" ADD COLUMN IF NOT EXISTS "country" varchar(2) DEFAULT 'DE' NOT NULL`
  );
  console.log("  ✓ Added areas.country");

  await db.execute(
    sql`ALTER TABLE "postal_codes" ADD COLUMN IF NOT EXISTS "country" varchar(2) DEFAULT 'DE' NOT NULL`
  );
  console.log("  ✓ Added postal_codes.country");

  await db.execute(
    sql`ALTER TABLE "postal_codes" ADD COLUMN IF NOT EXISTS "is_active" varchar(5) DEFAULT 'true' NOT NULL`
  );
  console.log("  ✓ Added postal_codes.is_active");

  await db.execute(
    sql`ALTER TABLE "postal_codes" ADD COLUMN IF NOT EXISTS "source_release" varchar(50)`
  );
  console.log("  ✓ Added postal_codes.source_release");

  await db.execute(
    sql`ALTER TABLE "states" ADD COLUMN IF NOT EXISTS "country" varchar(2) DEFAULT 'DE' NOT NULL`
  );
  console.log("  ✓ Added states.country");

  // 3. Add FK
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "area_layer_postal_codes" 
        ADD CONSTRAINT "fk_area_layer_postal_codes_postal_code_id" 
        FOREIGN KEY ("postal_code_id") REFERENCES "public"."postal_codes"("id") ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  console.log(
    "  ✓ Added FK area_layer_postal_codes.postal_code_id → postal_codes.id"
  );

  // 4. Add indexes
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "idx_areas_country" ON "areas" USING btree ("country")`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "idx_postal_codes_country" ON "postal_codes" USING btree ("country")`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "idx_postal_codes_country_granularity" ON "postal_codes" USING btree ("country","granularity")`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "idx_states_country" ON "states" USING btree ("country")`
  );
  console.log("  ✓ Added country indexes");

  // 5. Add unique constraints
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "postal_codes" ADD CONSTRAINT "postal_codes_country_granularity_code_unique" UNIQUE("country","granularity","code");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  console.log("  ✓ Added postal_codes unique(country, granularity, code)");

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE "states" ADD CONSTRAINT "states_country_code_unique" UNIQUE("country","code");
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  console.log("  ✓ Added states unique(country, code)");

  // 6. Verify
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
  console.log(`\nVerification:`);
  console.log(`  postal_codes with country=DE: ${(pc as any).cnt}`);
  console.log(`  states with country=DE: ${(st as any).cnt}`);
  console.log(`  areas with country=DE: ${(ar as any).cnt}`);

  console.log("\n✅ Migration 0010 complete!");
  process.exit(0);
}
migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
