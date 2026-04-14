import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

async function check() {
  try {
    const { rows: [ver] } = await db.execute(sql`SELECT version()`);
    console.log("DB connected:", (ver as any).version?.slice(0, 60));
    
    const counts = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as cnt, granularity FROM postal_codes GROUP BY granularity ORDER BY granularity`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM states`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM areas`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM area_layers`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM area_layer_postal_codes`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM area_versions`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM area_changes`),
    ]);
    
    console.log("\n=== Postal Codes by Granularity ===");
    for (const row of counts[0].rows) {
      console.log(`  ${(row as any).granularity}: ${(row as any).cnt}`);
    }
    console.log(`\nStates: ${(counts[1].rows[0] as any).cnt}`);
    console.log(`Areas: ${(counts[2].rows[0] as any).cnt}`);
    console.log(`Layers: ${(counts[3].rows[0] as any).cnt}`);
    console.log(`Layer Postal Codes: ${(counts[4].rows[0] as any).cnt}`);
    console.log(`Versions: ${(counts[5].rows[0] as any).cnt}`);
    console.log(`Changes: ${(counts[6].rows[0] as any).cnt}`);
    
    // Sample some postal codes to see format
    const { rows: samples } = await db.execute(sql`
      SELECT code, granularity FROM postal_codes 
      WHERE granularity = '5digit' 
      ORDER BY code LIMIT 10
    `);
    console.log("\n=== Sample 5-digit codes ===");
    for (const s of samples) console.log(`  ${(s as any).code}`);
    
    // Check unique constraints
    const { rows: constraints } = await db.execute(sql`
      SELECT tc.constraint_name, tc.constraint_type, 
             string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) as columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name IN ('postal_codes', 'states', 'areas', 'area_layer_postal_codes')
      AND tc.table_schema = 'public'
      GROUP BY tc.constraint_name, tc.constraint_type
      ORDER BY tc.constraint_type, tc.constraint_name
    `);
    console.log("\n=== Constraints ===");
    for (const c of constraints) {
      const r = c as any;
      console.log(`  ${r.constraint_type}: ${r.constraint_name} (${r.columns})`);
    }
    
    // Check existing columns
    const { rows: cols } = await db.execute(sql`
      SELECT table_name, column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name IN ('postal_codes', 'states', 'areas')
      AND table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    console.log("\n=== Schema ===");
    let t = '';
    for (const c of cols) {
      const r = c as any;
      if (r.table_name !== t) { console.log(`\n${r.table_name}:`); t = r.table_name; }
      console.log(`  ${r.column_name} (${r.data_type}${r.column_default ? ', default=' + r.column_default.slice(0,30) : ''})`);
    }
    
  } catch (e) {
    console.error("DB check failed:", e);
  }
  process.exit(0);
}
check();
