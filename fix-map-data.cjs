const fs = require("node:fs");

const code = fs.readFileSync("src/lib/utils/map-data.ts", "utf8");
const newMakeLabelPoints = `
/**
 * Creates a FeatureCollection of label points from a polygon FeatureCollection.
 * It groups features by their postal code property to ensure only one label
 * is rendered per postal code, even if it consists of multiple disconnected polygons.
 */
export function makeLabelPoints(features: FeatureCollection) {
  // Filter out features with no geometry
  const validFeatures = (features.features as Feature[]).filter(
    (f) => f.geometry
  );

  // Group by code/plz to avoid duplicate labels for multi-part areas
  const groups = new Map<string, Feature<Polygon | MultiPolygon>[]>();

  for (const f of validFeatures) {
    const props = f.properties || {};
    const code = props.PLZ || props.plz || props.code;

    if (code !== undefined && code !== null) {
      const key = String(code);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(f as Feature<Polygon | MultiPolygon>);
    } else {
      // If no code is found, just use a random unique key so it gets its own label
      groups.set(Math.random().toString(), [f as Feature<Polygon | MultiPolygon>]);
    }
  }

  const labelFeatures: Feature[] = [];

  for (const [key, groupFeatures] of groups.entries()) {
    // Find the absolute largest polygon across all features in the group
    let maxArea = -1;
    let bestCoords: [number, number] = [0, 0];

    // We just use the first feature's properties for the label
    const properties = groupFeatures[0].properties;

    for (const f of groupFeatures) {
      if (f.geometry.type === "Polygon") {
        const polyArea = area({ type: "Polygon", coordinates: f.geometry.coordinates });
        if (polyArea > maxArea) {
          maxArea = polyArea;
          bestCoords = centroid(f).geometry.coordinates as [number, number];
        }
      } else if (f.geometry.type === "MultiPolygon") {
        for (let i = 0; i < f.geometry.coordinates.length; i++) {
          const coords = f.geometry.coordinates[i];
          if (coords && coords[0]) {
            const polyArea = area({ type: "Polygon", coordinates: coords });
            if (polyArea > maxArea) {
              maxArea = polyArea;
              bestCoords = centroid({ type: "Polygon", coordinates: coords }).geometry.coordinates as [number, number];
            }
          }
        }
      }
    }

    labelFeatures.push(point(bestCoords, properties));
  }

  return {
    type: "FeatureCollection",
    features: labelFeatures,
  };
}
`;

const updatedCode = code.replace(
  /\/\*\*\n \* Creates a FeatureCollection of label points[\s\S]*\}\n\}/m,
  newMakeLabelPoints.trim()
);
fs.writeFileSync("src/lib/utils/map-data.ts", updatedCode);
console.log("done");
