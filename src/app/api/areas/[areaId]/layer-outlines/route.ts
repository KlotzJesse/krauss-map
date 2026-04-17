import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";

interface LayerOutlineRow {
  layerId: number;
  color: string;
  opacity: number;
  outline: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ areaId: string }> }
) {
  const { areaId } = await params;
  const id = Number.parseInt(areaId, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid areaId" }, { status: 400 });
  }

  try {
    // Union all postal code geometries per visible layer using PostGIS.
    // ST_SimplifyPreserveTopology at 0.002° (~200m) keeps the outline smooth
    // without being too coarse. Join via area's own granularity + country so
    // that cross-country DACH areas still resolve correctly.
    const { rows } = await db.execute(sql`
      SELECT
        l.id                                                          AS "layerId",
        l.color,
        l.opacity,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(
            ST_Union(pc.geometry),
            0.002
          )
        )                                                             AS outline
      FROM area_layers       l
      JOIN areas             a   ON a.id           = l.area_id
      JOIN area_layer_postal_codes alpc
                                 ON alpc.layer_id  = l.id
      JOIN postal_codes      pc  ON pc.code        = alpc.postal_code
                                AND pc.granularity = a.granularity
                                AND pc.country     = a.country
      WHERE l.area_id    = ${id}
        AND l.is_visible = 'true'
      GROUP BY l.id, l.color, l.opacity
    `);

    const result = (rows as unknown as LayerOutlineRow[])
      .filter((r) => r.outline !== null)
      .map((r) => ({
        layerId: r.layerId,
        color: r.color,
        opacity: r.opacity,
        outline: JSON.parse(r.outline as string),
      }));

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error computing layer outlines:", error);
    return NextResponse.json(
      { error: "Failed to compute layer outlines" },
      { status: 500 }
    );
  }
}
