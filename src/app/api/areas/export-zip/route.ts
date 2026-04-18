import { eq } from "drizzle-orm";
import { zipSync, strToU8 } from "fflate";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { areas, areaLayers, areaLayerPostalCodes } from "@/lib/schema/schema";

export async function GET() {
  try {
    const allAreas = await db
      .select({
        id: areas.id,
        name: areas.name,
        description: areas.description,
        granularity: areas.granularity,
        country: areas.country,
      })
      .from(areas)
      .where(eq(areas.isArchived, "false"));

    const files: Record<string, Uint8Array> = {};

    for (const area of allAreas) {
      const layers = await db
        .select({
          id: areaLayers.id,
          name: areaLayers.name,
          color: areaLayers.color,
          opacity: areaLayers.opacity,
          isVisible: areaLayers.isVisible,
          orderIndex: areaLayers.orderIndex,
          notes: areaLayers.notes,
        })
        .from(areaLayers)
        .where(eq(areaLayers.areaId, area.id))
        .orderBy(areaLayers.orderIndex);

      const layersWithCodes = await Promise.all(
        layers.map(async (layer) => {
          const codes = await db
            .select({ postalCode: areaLayerPostalCodes.postalCode })
            .from(areaLayerPostalCodes)
            .where(eq(areaLayerPostalCodes.layerId, layer.id));
          return {
            name: layer.name,
            color: layer.color,
            opacity: layer.opacity ?? 80,
            isVisible: layer.isVisible ?? "true",
            orderIndex: layer.orderIndex ?? 0,
            notes: layer.notes,
            postalCodes: codes.map((c) => c.postalCode).sort(),
          };
        })
      );

      const exportData = {
        version: 1,
        name: area.name,
        description: area.description,
        granularity: area.granularity ?? "5digit",
        country: area.country ?? "DE",
        layers: layersWithCodes,
      };

      const slug = area.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const filename = `${slug}-${area.id}.json`;
      files[filename] = strToU8(JSON.stringify(exportData, null, 2));

      // CSV per layer
      for (const layer of layersWithCodes) {
        const layerSlug = layer.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const csvContent = `PLZ\n${layer.postalCodes.join("\n")}`;
        files[`${slug}/${layerSlug}.csv`] = strToU8(csvContent);
      }
    }

    const zipped = zipSync(files);
    const today = new Date().toISOString().slice(0, 10);

    return new NextResponse(zipped.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="gebiete-export-${today}.zip"`,
      },
    });
  } catch (error) {
    console.error("ZIP export error:", error);
    return NextResponse.json(
      { error: "Export fehlgeschlagen" },
      { status: 500 }
    );
  }
}
