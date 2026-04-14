// Enumerate all PLZ polygons from postdirekt geocodes endpoint
export {};
const results: { prefix: string; count: number }[] = [];
let total = 0;
const allCodes = new Set<string>();

// Test all 100 two-digit prefixes
const prefixes = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, "0"));

// Process in batches of 10 to be nice to the server
for (let batch = 0; batch < 10; batch++) {
  const batchPrefixes = prefixes.slice(batch * 10, (batch + 1) * 10);
  const promises = batchPrefixes.map(async (prefix) => {
    try {
      const resp = await fetch(`https://postdirekt.de/plzsuche-service/geocodes?postal_code=${prefix}`);
      if (!resp.ok) return { prefix, count: 0 };
      const data = await resp.json() as { features?: { properties?: { code?: string } }[] };
      const features = data.features ?? [];
      for (const f of features) {
        const code = f.properties?.code;
        if (code) allCodes.add(code);
      }
      return { prefix, count: features.length };
    } catch {
      return { prefix, count: 0 };
    }
  });
  
  const batchResults = await Promise.all(promises);
  for (const r of batchResults) {
    if (r.count > 0) {
      results.push(r);
      total += r.count;
    }
  }
  console.log(`Batch ${batch + 1}/10: ${batchResults.reduce((s, r) => s + r.count, 0)} features`);
}

console.log(`\nTotal features across all prefixes: ${total}`);
console.log(`Unique postal codes: ${allCodes.size}`);

// Show distribution
const sorted = results.sort((a, b) => b.count - a.count);
console.log(`\nTop 10 prefixes by count:`);
for (const r of sorted.slice(0, 10)) {
  console.log(`  ${r.prefix}: ${r.count}`);
}
console.log(`\nBottom 10:`);
for (const r of sorted.slice(-10)) {
  console.log(`  ${r.prefix}: ${r.count}`);
}

// Check code lengths
const lengths: Record<number, number> = {};
for (const code of allCodes) {
  const len = code.length;
  lengths[len] = (lengths[len] ?? 0) + 1;
}
console.log(`\nCode lengths: ${JSON.stringify(lengths)}`);

// Compare with our DB count
console.log(`\nOur DB: 8,170 5-digit codes`);
console.log(`PostDirekt: ${allCodes.size} unique codes`);
