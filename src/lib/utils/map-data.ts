import area from "@turf/area";
import centerOfMass from "@turf/center-of-mass";
import { point } from "@turf/helpers";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";

/**
 * Creates a FeatureCollection of label points from a polygon FeatureCollection.
 * It groups features by their postal code property to ensure only one label
 * is rendered per postal code, even if it consists of multiple disconnected polygons.
 */
function largestPolygonCentroid(
  groupFeatures: Feature<Polygon | MultiPolygon>[]
): number[] {
  let maxArea = -1;
  // Track the best polygon geometry to compute centerOfMass only once at the end.
  let bestFeature: Feature<Polygon | MultiPolygon> | null = null;
  let bestPolyCoords: number[][][] | null = null;
  for (const f of groupFeatures) {
    if (f.geometry.type === "Polygon") {
      const polyArea = area({
        type: "Polygon",
        coordinates: f.geometry.coordinates,
      });
      if (polyArea > maxArea) {
        maxArea = polyArea;
        bestFeature = f;
        bestPolyCoords = null;
      }
    } else if (f.geometry.type === "MultiPolygon") {
      for (const coords of f.geometry.coordinates) {
        if (coords?.[0]) {
          const polyArea = area({ type: "Polygon", coordinates: coords });
          if (polyArea > maxArea) {
            maxArea = polyArea;
            bestFeature = null;
            bestPolyCoords = coords;
          }
        }
      }
    }
  }
  if (bestFeature) {
    return centerOfMass(bestFeature).geometry.coordinates;
  }
  if (bestPolyCoords) {
    return centerOfMass({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: bestPolyCoords },
      properties: null,
    }).geometry.coordinates;
  }
  return [0, 0];
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

/**
 * Label points for all digit levels (1–5), derived from the postal-code index.
 *
 * Same output as `makeLabelPoints`: one point per code prefix per level, placed
 * on the largest member of that prefix group. The difference is where the
 * geometry comes from — the index ships a representative point and an area per
 * code, so this is a grouping pass over numbers instead of `centerOfMass` over
 * every polygon in the country, which was the single most expensive thing the
 * map did on load.
 *
 * The point used is `ST_PointOnSurface` rather than a centre of mass, so it is
 * guaranteed to lie inside its polygon — a centre of mass is not, and put some
 * labels for horseshoe-shaped codes outside their own area.
 */
export function makeLabelPointsFromIndex(index: {
  keys: string[];
  cen: Float64Array;
  area: Float64Array;
}): FeatureCollection {
  let maxLen = 0;
  const rawCodes: string[] = new Array(index.keys.length);
  for (let i = 0; i < index.keys.length; i++) {
    const key = index.keys[i];
    const colon = key.indexOf(":");
    const raw = colon >= 0 ? key.slice(colon + 1) : key;
    rawCodes[i] = raw;
    if (raw.length > maxLen) {
      maxLen = raw.length;
    }
  }
  const levels = Math.min(maxLen, 5);

  // "level:prefix" -> index of the largest-area member seen so far.
  const best = new Map<string, number>();

  for (let i = 0; i < rawCodes.length; i++) {
    const raw = rawCodes[i];
    const memberArea = index.area[i];
    for (let level = 1; level <= Math.min(levels, raw.length); level++) {
      const key = `${level}:${raw.slice(0, level)}`;
      const current = best.get(key);
      if (current === undefined || memberArea > index.area[current]) {
        best.set(key, i);
      }
    }
  }

  const features: ReturnType<typeof point>[] = new Array(best.size);
  let n = 0;
  for (const [key, i] of best) {
    const colon = key.indexOf(":");
    features[n++] = point([index.cen[i * 2], index.cen[i * 2 + 1]], {
      _labelCode: key.slice(colon + 1),
      _labelLevel: Number(key.slice(0, colon)),
    });
  }

  return { type: "FeatureCollection", features };
}
