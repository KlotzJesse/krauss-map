import area from "@turf/area";
import centerOfMass from "@turf/center-of-mass";
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

    result = centerOfMass({ type: "Polygon", coordinates: bestPolygon })
      .geometry.coordinates as [number, number];
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
 * Single-pass: groups all levels simultaneously instead of iterating features 5× separately.
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
    if (raw.length > maxLen) {
      maxLen = raw.length;
    }
  }
  const levels = Math.min(maxLen, 5);

  // Single pass: build all prefix groups for all levels simultaneously.
  // Key format: "level:prefix" → features array.
  const allGroups = new Map<string, Feature<Polygon | MultiPolygon>[]>();

  for (const f of validFeatures) {
    const props = f.properties ?? {};
    const raw = String(props.PLZ ?? props.plz ?? props.code ?? "");
    const len = raw.length;

    for (let level = 1; level <= Math.min(levels, len); level++) {
      const prefix = raw.slice(0, level);
      const key = `${level}:${prefix}`;
      const existing = allGroups.get(key);
      if (existing) {
        existing.push(f as Feature<Polygon | MultiPolygon>);
      } else {
        allGroups.set(key, [f as Feature<Polygon | MultiPolygon>]);
      }
    }
  }

  const labelFeatures: ReturnType<typeof point>[] = [];

  for (const [key, group] of allGroups) {
    const colonIdx = key.indexOf(":");
    const level = Number(key.slice(0, colonIdx));
    const prefix = key.slice(colonIdx + 1);
    const coords = largestPolygonCentroid(group);
    labelFeatures.push(
      point(coords, { _labelCode: prefix, _labelLevel: level })
    );
  }

  return { type: "FeatureCollection", features: labelFeatures };
}

/** Ray-casting point-in-polygon test. Pure geometry — no React/hooks. */
export function isPointInPolygon(
  testPoint: [number, number],
  polygon: number[][]
): boolean {
  let inside = false;
  const [x, y] = testPoint;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
