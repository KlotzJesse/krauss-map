import { db } from "../src/lib/db";

async function checkData() {
  try {
    const areas = await db.query.areas.findMany({
      with: {
        layers: {
          with: {
            postalCodes: true,
          },
        },
      },
    });

    console.log(`\n📊 Current Database State:\n`);
    console.log(`Total Areas: ${areas.length}`);

    for (const area of areas) {
      console.log(`\nArea #${area.id}: ${area.name}`);
      console.log(`  Layers: ${area.layers?.length || 0}`);

      if (area.layers && area.layers.length > 0) {
        for (const layer of area.layers) {
          console.log(
            `    - ${layer.name}: ${layer.postalCodes?.length || 0} postal codes`
          );
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkData();
