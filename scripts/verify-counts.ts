import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";

async function verify() {
  // Check our 5-digit count
  const {
    rows: [r1],
  } = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM postal_codes WHERE granularity = '5digit'`
  );
  console.log(`Our 5-digit DE codes: ${(r1 as any).cnt}`);

  // Check some edge cases - codes that start with 0 (leading zeros)
  const {
    rows: [r2],
  } = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM postal_codes WHERE granularity = '5digit' AND code LIKE '0%'`
  );
  console.log(`Codes starting with 0: ${(r2 as any).cnt}`);

  // Min/max codes
  const {
    rows: [r3],
  } = await db.execute(
    sql`SELECT MIN(code) as mn, MAX(code) as mx FROM postal_codes WHERE granularity = '5digit'`
  );
  console.log(`Range: ${(r3 as any).mn} - ${(r3 as any).mx}`);

  // Check if any code has length != 5
  const {
    rows: [r4],
  } = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM postal_codes WHERE granularity = '5digit' AND LENGTH(code) != 5`
  );
  console.log(`Non-5-char codes: ${(r4 as any).cnt}`);

  // Summary of all granularities
  const { rows: grains } = await db.execute(sql`
    SELECT granularity, COUNT(*) as cnt, 
           MIN(code) as min_code, MAX(code) as max_code,
           MIN(LENGTH(code)) as min_len, MAX(LENGTH(code)) as max_len
    FROM postal_codes 
    GROUP BY granularity ORDER BY granularity
  `);
  console.log("\nAll granularities:");
  for (const g of grains) {
    const r = g as any;
    console.log(
      `  ${r.granularity}: ${r.cnt} codes (${r.min_code}–${r.max_code}, len ${r.min_len}–${r.max_len})`
    );
  }

  // Check states
  const { rows: statesList } = await db.execute(
    sql`SELECT name, code FROM states ORDER BY code`
  );
  console.log(`\nStates (${statesList.length}):`);
  for (const s of statesList)
    console.log(`  ${(s as any).code}: ${(s as any).name}`);

  process.exit(0);
}
verify();
