/**
 * Shared map utility functions for feature selection, adjacency, and region analysis.
 * Used by DrawingTools and potentially other map-related components.
 *
 * - getPolygons: Converts a (Multi)Polygon feature to an array of Polygon features.
 * - isRegionIntersected: Checks if any polygon in a region intersects with another.
 * - isRegionAdjacent: Checks if a region is adjacent to any selected region.
 * - findHoles: Finds unselected regions that are "holes" (not reachable from the map edge).
 */

import booleanIntersects from "@turf/boolean-intersects";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";

// Memoize polygons for each feature
const polygonCache = new WeakMap<object, Feature<Polygon>[]>();
export function getPolygons(
  feature: Feature<Polygon | MultiPolygon>
): Feature<Polygon>[] {
  if (!feature || !feature.geometry) {return [];}
  if (polygonCache.has(feature)) {return polygonCache.get(feature)!;}
  let result: Feature<Polygon>[] = [];
  if (feature.geometry.type === "Polygon") {
    result = [feature as Feature<Polygon>];
  } else if (feature.geometry.type === "MultiPolygon") {
    result = (feature.geometry.coordinates as number[][][][]).map((coords) => ({
      type: "Feature",
      properties: feature.properties,
      geometry: { type: "Polygon", coordinates: coords },
    }));
  }
  polygonCache.set(feature, result);
  return result;
}

// Helper: check if any polygon in region intersects any polygon in combined
export function isRegionIntersected(
  combined: Feature<Polygon | MultiPolygon>,
  region: Feature<Polygon | MultiPolygon>
) {
  const combinedPolys = getPolygons(combined) || [];
  const regionPolys = getPolygons(region) || [];
  return regionPolys.some((regionPoly) =>
    combinedPolys.some((combinedPoly) => {
      try {
        return booleanIntersects(combinedPoly, regionPoly);
      } catch {
        return false;
      }
    })
  );
}

// Helper: check if region is adjacent to any selected region
export function isRegionAdjacent(
  region: Feature<Polygon | MultiPolygon>,
  selectedFeatures: Feature<Polygon | MultiPolygon>[]
) {
  const regionPolys = getPolygons(region) || [];
  return selectedFeatures.some((sel) => {
    const selPolys = getPolygons(sel) || [];
    return regionPolys.some((regionPoly) =>
      selPolys.some((selPoly) => {
        try {
          return booleanIntersects(regionPoly, selPoly);
        } catch {
          return false;
        }
      })
    );
  });
}

// Helper: flood fill from outside to find holes
export function findHoles(
  postalCodesData: FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>,
  selectedCodes: Set<string>
) {
  // Build adjacency graph
  const features = postalCodesData.features;
  const codeMap = new Map<string, Feature<Polygon | MultiPolygon>>();
  features.forEach((f) => {
    const code = f.properties?.code || f.properties?.PLZ || f.properties?.plz;
    if (code) {codeMap.set(code, f);}
  });
  // Build adjacency list
  const adj = new Map<string, Set<string>>();
  for (const f of features) {
    const code = f.properties?.code || f.properties?.PLZ || f.properties?.plz;
    if (!code) {continue;}
    adj.set(code, new Set());
    for (const g of features) {
      const gcode =
        g.properties?.code || g.properties?.PLZ || g.properties?.plz;
      if (!gcode || gcode === code) {continue;}
      if (isRegionAdjacent(f, [g])) {adj.get(code)!.add(gcode);}
    }
  }
  // Find all regions on the edge (not selected, touching map boundary)
  // For simplicity, treat all unselected regions as possible outside
  const outside = new Set<string>();
  for (const f of features) {
    const code = f.properties?.code || f.properties?.PLZ || f.properties?.plz;
    if (!code || selectedCodes.has(code)) {continue;}
    // Heuristic: if region touches map boundary (min/max lat/lon), treat as outside
    const coords = getPolygons(f).flatMap((poly) =>
      Array.isArray(poly.geometry.coordinates)
        ? poly.geometry.coordinates.flat(1)
        : []
    );
    if (
      coords.some(
        (coord) =>
          Array.isArray(coord) &&
          coord.length === 2 &&
          typeof coord[0] === "number" &&
          typeof coord[1] === "number" &&
          (coord[1] < 47.2 ||
            coord[1] > 55.1 ||
            coord[0] < 5.7 ||
            coord[0] > 15.1)
      )
    ) {
      outside.add(code);
    }
  }
  // Flood fill from outside
  const visited = new Set(outside);
  const queue = [...outside];
  while (queue.length) {
    const curr = queue.pop()!;
    for (const neighbor of adj.get(curr) ?? []) {
      if (!selectedCodes.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  // Any unselected region not visited is a hole
  const holes: string[] = [];
  for (const f of features) {
    const code = f.properties?.code || f.properties?.PLZ || f.properties?.plz;
    if (!code || selectedCodes.has(code)) {continue;}
    if (!visited.has(code)) {holes.push(code);}
  }
  return holes;
}
