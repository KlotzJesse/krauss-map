import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { areas, areaLayers } from "../src/lib/schema/schema";
import { reassignAllColors } from "../src/lib/utils/layer-colors";

async function reassignLayerColors() {
  try {
    console.log("Reassigning layer colors for maximum contrast...\n");

    const allAreas = await db
      .select({ id: areas.id, name: areas.name })
      .from(areas);

    let totalUpdated = 0;

    for (const area of allAreas) {
      const layers = await db
        .select({
          id: areaLayers.id,
          color: areaLayers.color,
          name: areaLayers.name,
        })
        .from(areaLayers)
        .where(eq(areaLayers.areaId, area.id))
        .orderBy(areaLayers.orderIndex);

      if (layers.length < 2) {
        continue;
      }

      const colorMap = reassignAllColors(layers);

      console.log(`Area "${area.name}" (${layers.length} layers):`);
      for (const layer of layers) {
        const newColor = colorMap.get(layer.id)!;
        if (newColor !== layer.color) {
          await db
            .update(areaLayers)
            .set({ color: newColor })
            .where(eq(areaLayers.id, layer.id));
          console.log(`  ${layer.name}: ${layer.color} → ${newColor}`);
          totalUpdated++;
        } else {
          console.log(`  ${layer.name}: ${layer.color} (unchanged)`);
        }
      }
    }

    console.log(
      `\n✓ Updated ${totalUpdated} layer colors across ${allAreas.length} areas`
    );
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

reassignLayerColors();
