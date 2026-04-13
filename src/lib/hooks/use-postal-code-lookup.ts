import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useMemo } from "react";

import { useStableCallback } from "./use-stable-callback";

interface UsePostalCodeLookupOptions {
  data: FeatureCollection<Polygon | MultiPolygon>;
}

// Ray-casting point-in-polygon test (module-level to avoid re-creation)
function isPointInPolygon(
  point: [number, number],
  polygon: number[][]
): boolean {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

interface SpatialEntry {
  feature: FeatureCollection<Polygon | MultiPolygon>["features"][number];
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number };
}

export function usePostalCodeLookup({ data }: UsePostalCodeLookupOptions) {
  // Spatial index for bounding-box pre-filter + point-in-polygon
  const spatialIndex = useMemo(() => {
    const index = new Map<string, SpatialEntry>();
    for (const feature of data.features) {
      const geometry = feature.geometry;
      if (!geometry) {
        continue;
      }

      let maxLat = -Infinity;
      let maxLng = -Infinity;
      let minLat = Infinity;
      let minLng = Infinity;

      if (geometry.type === "Polygon") {
        for (const [lng, lat] of geometry.coordinates[0]) {
          if (lng < minLng) {
            minLng = lng;
          }
          if (lng > maxLng) {
            maxLng = lng;
          }
          if (lat < minLat) {
            minLat = lat;
          }
          if (lat > maxLat) {
            maxLat = lat;
          }
        }
      } else if (geometry.type === "MultiPolygon") {
        const coords = geometry.coordinates[0]?.[0];
        if (coords) {
          for (const [lng, lat] of coords) {
            if (lng < minLng) {
              minLng = lng;
            }
            if (lng > maxLng) {
              maxLng = lng;
            }
            if (lat < minLat) {
              minLat = lat;
            }
            if (lat > maxLat) {
              maxLat = lat;
            }
          }
        }
      }

      if (minLng !== Infinity) {
        const code =
          feature.properties?.code ??
          feature.properties?.PLZ ??
          feature.properties?.plz;
        if (code) {
          index.set(String(code), {
            feature,
            bounds: { minLng, maxLng, minLat, maxLat },
          });
        }
      }
    }
    return index;
  }, [data.features]);

  const findPostalCodeByCoords = useStableCallback(
    (lng: number, lat: number) => {
      for (const [code, { feature, bounds }] of spatialIndex) {
        if (
          lng < bounds.minLng ||
          lng > bounds.maxLng ||
          lat < bounds.minLat ||
          lat > bounds.maxLat
        ) {
          continue;
        }
        if (feature.geometry.type === "Polygon") {
          if (
            isPointInPolygon(
              [lng, lat],
              feature.geometry.coordinates[0] as number[][]
            )
          ) {
            return code;
          }
        } else if (feature.geometry.type === "MultiPolygon") {
          for (const poly of feature.geometry.coordinates) {
            if (
              Array.isArray(poly?.[0]) &&
              isPointInPolygon([lng, lat], poly[0] as number[][])
            ) {
              return code;
            }
          }
        }
      }
      return null;
    }
  );

  return {
    findPostalCodeByCoords,
  };
}
