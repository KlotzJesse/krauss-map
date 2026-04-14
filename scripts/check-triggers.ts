import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

async function check() {
  const { rows } = await db.execute(sql`
    SELECT trigger_name, event_manipulation, event_object_table, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'public'
    ORDER BY event_object_table, trigger_name
  `);
  console.log('Triggers:');
  for (const r of rows) {
    const t = r as any;
    console.log(`  ${t.event_object_table}.${t.trigger_name} (${t.action_timing} ${t.event_manipulation})`);
  }
  
  // Also check if columns are GENERATED ALWAYS AS IDENTITY
  const { rows: cols } = await db.execute(sql`
    SELECT table_name, column_name, is_identity, identity_generation
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND is_identity = 'YES'
    ORDER BY table_name, column_name
  `);
  console.log('\nIdentity columns:');
  for (const c of cols) {
    const col = c as any;
    console.log(`  ${col.table_name}.${col.column_name} (${col.identity_generation})`);
  }
  
  process.exit(0);
}
check();
