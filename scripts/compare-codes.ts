import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

async function compare() {
  const { rows } = await db.execute(sql`SELECT code FROM postal_codes WHERE granularity = '5digit' ORDER BY code`);
  const dbCodes = new Set(rows.map((r: any) => r.code));
  
  const pdCodes = new Set<string>();
  const prefixes = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, "0"));
  
  for (let batch = 0; batch < 10; batch++) {
    const batchPrefixes = prefixes.slice(batch * 10, (batch + 1) * 10);
    const results = await Promise.all(batchPrefixes.map(async (prefix) => {
      try {
        const resp = await fetch(`https://postdirekt.de/plzsuche-service/geocodes?postal_code=${prefix}`);
        if (!resp.ok) return [];
        const text = await resp.text();
        if (!text) return [];
        const data = JSON.parse(text);
        return (data.features ?? []).map((f: any) => f.properties?.code).filter(Boolean) as string[];
      } catch { return []; }
    }));
    for (const codes of results) for (const c of codes) pdCodes.add(c);
  }
  
  const onlyInDb = [...dbCodes].filter(c => !pdCodes.has(c)).sort();
  const onlyInPd = [...pdCodes].filter(c => !dbCodes.has(c)).sort();
  
  console.log(`DB: ${dbCodes.size} | PostDirekt: ${pdCodes.size}`);
  console.log(`\nOnly in DB (${onlyInDb.length}): ${onlyInDb.join(", ")}`);
  console.log(`Only in PostDirekt (${onlyInPd.length}): ${onlyInPd.join(", ")}`);
  
  process.exit(0);
}
compare();
