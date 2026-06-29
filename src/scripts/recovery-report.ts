import "dotenv/config";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // Show per-area recovery stats
    const { rows } = await client.query(`
      SELECT 
        a.id,
        a.name,
        COUNT(DISTINCT al.id) as total_layers,
        COUNT(DISTINCT alpc.layer_id) as layers_with_codes,
        COUNT(alpc.id) as total_codes
      FROM areas a
      JOIN area_layers al ON al.area_id = a.id
      LEFT JOIN area_layer_postal_codes alpc ON alpc.layer_id = al.id
      GROUP BY a.id, a.name
      ORDER BY a.id
    `);

    console.log("Recovery status per area:");
    console.log("Area ID | Area Name                        | Layers | With codes | Total codes");
    console.log("--------|----------------------------------|--------|------------|------------");
    for (const r of rows) {
      const name = r.name.padEnd(32, " ").substring(0, 32);
      console.log(
        `  ${String(r.id).padEnd(5)} | ${name} | ${String(r.total_layers).padEnd(6)} | ${String(r.layers_with_codes).padEnd(10)} | ${r.total_codes}`
      );
    }

    // Total
    const { rows: total } = await client.query(
      `SELECT COUNT(*) as n FROM area_layer_postal_codes`
    );
    console.log(`\nTotal entries: ${total[0].n}`);

    // Which layers still have 0 codes?
    const { rows: emptyLayers } = await client.query(`
      SELECT al.id, al.name, al.area_id, a.name as area_name
      FROM area_layers al
      JOIN areas a ON al.area_id = a.id
      WHERE al.id NOT IN (SELECT DISTINCT layer_id FROM area_layer_postal_codes)
      ORDER BY a.id, al.id
    `);
    console.log(`\nLayers with 0 codes recovered (${emptyLayers.length} total):`);
    for (const r of emptyLayers) {
      console.log(`  area ${r.area_id} '${r.area_name}' → layer ${r.id} '${r.name}'`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
