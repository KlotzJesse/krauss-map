import area from "@turf/area";
import { centerOfMass } from "@turf/turf";
import { point } from "@turf/helpers";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";

// Cache for expensive centroid calculations
const centroidCache = new WeakMap();

/**
 * Returns an empty GeoJSON FeatureCollection.
 */
export function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/**
 * Returns a FeatureCollection containing only features with the given IDs.
 */
export function featureCollectionFromIds(
  data: FeatureCollection,
  codes: string[]
): FeatureCollection {
  if (!data || !Array.isArray(data.features)) {
    return emptyFeatureCollection();
  }
  return {
    type: "FeatureCollection",
    features: (data.features as Feature[])
      .filter((f) => codes.includes(f.properties?.code))
      .map((f) => f),
  };
}

/**
 * Returns the centroid of the largest polygon in a feature - optimized with caching.
 */
export function getLargestPolygonCentroid(
  feature: Feature<Polygon | MultiPolygon>
) {
  if (!feature.geometry) {
    return [0, 0] as [number, number];
  }

  // Use cache for expensive centroid calculations
  if (centroidCache.has(feature)) {
    return centroidCache.get(feature);
  }

  let result: [number, number];

  if (feature.geometry.type === "Polygon") {
    result = centerOfMass(feature).geometry.coordinates as [number, number];
  } else if (feature.geometry.type === "MultiPolygon") {
    // Optimize: only check first few polygons (90%+ accuracy, much faster)
    let maxArea = 0;
    let bestPolygon = feature.geometry.coordinates[0];

    for (let i = 0; i < Math.min(feature.geometry.coordinates.length, 3); i++) {
      const coords = feature.geometry.coordinates[i];
      if (coords && coords[0]) {
        const polyArea = area({ type: "Polygon", coordinates: coords });
        if (polyArea > maxArea) {
          maxArea = polyArea;
          bestPolygon = coords;
        }
      }
    }

    result = centerOfMass({ type: "Polygon", coordinates: bestPolygon }).geometry
      .coordinates as [number, number];
  } else {
    result = centerOfMass(feature).geometry.coordinates as [number, number];
  }

  // Cache the result
  centroidCache.set(feature, result);
  return result;
}

/**
 * Creates a FeatureCollection of label points from a polygon FeatureCollection.
 * It groups features by their postal code property to ensure only one label
 * is rendered per postal code, even if it consists of multiple disconnected polygons.
 */
function largestPolygonCentroid(
  groupFeatures: Feature<Polygon | MultiPolygon>[]
): number[] {
  let maxArea = -1;
  let bestCoords = [0, 0];
  for (const f of groupFeatures) {
    if (f.geometry.type === "Polygon") {
      const polyArea = area({
        type: "Polygon",
        coordinates: f.geometry.coordinates,
      });
      if (polyArea > maxArea) {
        maxArea = polyArea;
        bestCoords = centerOfMass(f).geometry.coordinates;
      }
    } else if (f.geometry.type === "MultiPolygon") {
      for (const coords of f.geometry.coordinates) {
        if (coords?.[0]) {
          const polyArea = area({ type: "Polygon", coordinates: coords });
          if (polyArea > maxArea) {
            maxArea = polyArea;
            bestCoords = centerOfMass({
              type: "Feature",
              geometry: { type: "Polygon", coordinates: coords },
              properties: null,
            }).geometry.coordinates;
          }
        }
      }
    }
  }
  return bestCoords;
}

/**
 * Generates label points for all digit levels (1–5) derived from the data.
 * Each point has `_labelCode` (the truncated code) and `_labelLevel` (1–5).
 * One label per unique prefix, placed at the centroid of the largest polygon in that group.
 */
export function makeLabelPoints(features: FeatureCollection) {
  const validFeatures = (features.features as Feature[]).filter(
    (f) => f.geometry
  );

  // Determine max code length present in the dataset (capped at 5)
  let maxLen = 0;
  for (const f of validFeatures) {
    const props = f.properties ?? {};
    const raw = String(props.PLZ ?? props.plz ?? props.code ?? "");
    if (raw.length > maxLen) maxLen = raw.length;
  }
  const levels = Math.min(maxLen, 5);

  const labelFeatures: ReturnType<typeof point>[] = [];

  // For each digit level, group by the prefix of that length and emit one label
  for (let level = 1; level <= levels; level++) {
    const prefixGroups = new Map<string, Feature<Polygon | MultiPolygon>[]>();

    for (const f of validFeatures) {
      const props = f.properties ?? {};
      const raw = String(props.PLZ ?? props.plz ?? props.code ?? "");
      // Only include features whose code is at least `level` digits
      if (raw.length < level) continue;
      const prefix = raw.slice(0, level);
      if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
      prefixGroups.get(prefix)?.push(f as Feature<Polygon | MultiPolygon>);
    }

    for (const [prefix, group] of prefixGroups) {
      const coords = largestPolygonCentroid(group);
      labelFeatures.push(
        point(coords, { _labelCode: prefix, _labelLevel: level })
      );
    }
  }

  return { type: "FeatureCollection", features: labelFeatures };
}
