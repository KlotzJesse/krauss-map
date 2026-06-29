/**
 * Import postal codes from gebiete-export XLSX files.
 * Format: one sheet per layer (sheet name = layer name, ≤31 chars)
 * Column 2 header "PLZ mit D-" contains the prefixed codes (e.g. "D-12345")
 */

import "dotenv/config";
import XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";
import { Pool } from "pg";

interface ExportFile {
  file: string;
  areaId: number;
  areaName: string;
}

// Map export filename prefix → area ID
const EXPORT_FILES: ExportFile[] = [
  {
    file: "HOFMANNs_gebiete-export-2026-06-18T08-20-04.xlsx",
    areaId: 45,
    areaName: "HOFMANNs",
  },
  {
    file: "Sky_gebiete-export-2026-05-19T07-47-57.xlsx",
    areaId: 74,
    areaName: "Sky",
  },
  {
    file: "Tchibo_25_gebiete-export-2026-06-16T14-00-09.xlsx",
    areaId: 34,
    areaName: "Tchibo 25",
  },
  {
    file: "Tchibo_26_gebiete-export-2026-06-16T14-01-04.xlsx",
    areaId: 43,
    areaName: "Tchibo 26",
  },
  {
    file: "Leibinger_25_gebiete-export-2026-05-11T12-29-38.xlsx",
    areaId: 76,
    areaName: "Leibinger 25",
  },
  // Ecolab SDM 26 — already partially recovered, but export has full data
  {
    file: "Ecolab_SDM_26_gebiete-export-2026-04-30T08-02-34.xlsx",
    areaId: 36,
    areaName: "Ecolab SDM 26",
  },
  // Ecolab SDM (TEST) — already partially recovered
  {
    file: "Ecolab_SDM_gebiete-export-2026-04-15T08-59-39.xlsx",
    areaId: 70,
    areaName: "Ecolab SDM (TEST)",
  },
];

const DOWNLOADS = path.join(process.env.USERPROFILE || process.env.HOME || "", "Downloads");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // Load all layers keyed by (areaId, name_truncated_31)
    const { rows: allLayers } = await client.query<{
      id: number; area_id: number; name: string;
    }>(`SELECT id, area_id, name FROM area_layers ORDER BY area_id, id`);

    // Build lookup: areaId → Map<layerNameTruncated, layerId>
    const layerLookup = new Map<number, Map<string, number>>();
    for (const l of allLayers) {
      if (!layerLookup.has(l.area_id)) layerLookup.set(l.area_id, new Map());
      const truncated = l.name.slice(0, 31);
      layerLookup.get(l.area_id)!.set(truncated, l.id);
      // Also store exact name
      layerLookup.get(l.area_id)!.set(l.name, l.id);
    }

    let totalInserted = 0;
    const notMatched: string[] = [];

    for (const { file, areaId, areaName } of EXPORT_FILES) {
      const filePath = path.join(DOWNLOADS, file);
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${file}`);
        continue;
      }

      console.log(`\n📂 Processing: ${file} (area ${areaId} '${areaName}')`);
      const wb = XLSX.readFile(filePath);
      const areaLayers = layerLookup.get(areaId);

      let areaInserted = 0;
      let layersProcessed = 0;

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;

        // Find the layer in DB by sheet name (try exact, then truncated match)
        let layerId: number | undefined = areaLayers?.get(sheetName);
        if (!layerId) {
          // Try case-insensitive match
          for (const [name, id] of (areaLayers ?? new Map())) {
            if (name.toLowerCase() === sheetName.toLowerCase()) {
              layerId = id;
              break;
            }
          }
        }

        if (!layerId) {
          notMatched.push(`area ${areaId} '${areaName}' → sheet '${sheetName}'`);
          continue;
        }

        // Read data from sheet
        const data = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
        }) as unknown as string[][];

        if (data.length < 2) continue; // Only header, no data

        // Find column with "PLZ mit" or "mit D-" or similar header
        const headers = data[0] ?? [];
        let codeColIdx = headers.findIndex(
          (h) => h && (h.includes("mit") || h.includes("mit D") || h.includes("mit A") || h.includes("mit CH"))
        );
        if (codeColIdx < 0) codeColIdx = 1; // Default to column 2

        // Collect codes (skip header row)
        const codes = new Set<string>();
        const skipped: string[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const cell = row?.[codeColIdx];
          if (cell && typeof cell === "string") {
            const code = cell.trim();
            if (code && code.includes("-") && code.length <= 10) {
              codes.add(code);
            } else if (code && code.length > 10) {
              skipped.push(code);
            }
          }
        }
        if (skipped.length > 0) {
          console.log(`    ⚠️  Skipped ${skipped.length} oversized values: ${skipped.slice(0, 3).join(", ")}...`);
        }

        if (codes.size === 0) continue;

        // Insert
        const values: string[] = [];
        const params: any[] = [];
        let idx = 1;
        for (const code of codes) {
          values.push(`($${idx}, $${idx + 1})`);
          params.push(layerId, code);
          idx += 2;
        }

        await client.query(
          `INSERT INTO area_layer_postal_codes (layer_id, postal_code) VALUES ${values.join(", ")}
           ON CONFLICT (layer_id, postal_code) DO NOTHING`,
          params
        );

        console.log(`  ✅ Layer '${sheetName}' (id ${layerId}): ${codes.size} codes`);
        areaInserted += codes.size;
        layersProcessed++;
      }

      console.log(`  → Area total: ${areaInserted} codes across ${layersProcessed} layers`);
      totalInserted += areaInserted;
    }

    if (notMatched.length > 0) {
      console.log("\n⚠️  Sheets not matched to DB layers:");
      for (const s of notMatched) console.log(`  - ${s}`);
    }

    // Final count
    const { rows: finalCnt } = await client.query(
      `SELECT COUNT(*) as n FROM area_layer_postal_codes`
    );
    console.log(`\n✅ Import complete!`);
    console.log(`   Codes inserted this run: ${totalInserted}`);
    console.log(`   Total in DB now: ${finalCnt[0].n}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
