import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import { useMemo } from "react";

import { makeLabelPoints } from "@/lib/utils/map-data";

interface UseMapOptimizationsProps {
  data: FeatureCollection<Polygon | MultiPolygon>;
  statesData?: FeatureCollection<Polygon | MultiPolygon> | null;
}

/**
 * Hook for optimized memoization of heavy computations.
 * Prevents unnecessary re-renders and recalculations.
 */
export function useMapOptimizations({
  data,
  statesData,
}: UseMapOptimizationsProps) {
  // Memoize label points computation (expensive operation)
  const labelPoints = useMemo(
    () => makeLabelPoints(data) as FeatureCollection,
    [data]
  );

  // Memoize states label points if available
  const statesLabelPoints = useMemo(
    () =>
      statesData ? (makeLabelPoints(statesData) as FeatureCollection) : null,
    [statesData]
  );

  // Pre-built postal-code → feature index for O(k) label center lookups.
  const featureIndex = useMemo(() => {
    const index = new Map<string, Feature<Polygon | MultiPolygon>[]>();
    for (const feature of data.features) {
      if (!feature.geometry) {
        continue;
      }
      const props = feature.properties ?? {};
      const code = props.code ?? props.plz ?? props.PLZ ?? props.postalCode;
      if (!code) {
        continue;
      }
      const key = String(code);
      const existing = index.get(key);
      if (existing) {
        existing.push(feature as Feature<Polygon | MultiPolygon>);
      } else {
        index.set(key, [feature as Feature<Polygon | MultiPolygon>]);
      }
    }
    return index;
  }, [data]);

  // Memoize data extent for bounds calculations
  const dataExtent = useMemo(() => {
    if (!data.features.length) {
      return null;
    }

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    for (const feature of data.features) {
      const geometry = feature.geometry;
      if (!geometry) {
        continue;
      }
      if (geometry.type === "Polygon") {
        const coords = geometry.coordinates[0];
        for (const coord of coords) {
          const [lng, lat] = coord;
          if (lng < minLng) {minLng = lng;}
          if (lng > maxLng) {maxLng = lng;}
          if (lat < minLat) {minLat = lat;}
          if (lat > maxLat) {maxLat = lat;}
        }
      } else if (geometry.type === "MultiPolygon") {
        for (const polygon of geometry.coordinates) {
          const coords = polygon[0];
          if (coords) {
            for (const coord of coords) {
              const [lng, lat] = coord;
              if (lng < minLng) {minLng = lng;}
              if (lng > maxLng) {maxLng = lng;}
              if (lat < minLat) {minLat = lat;}
              if (lat > maxLat) {maxLat = lat;}
            }
          }
        }
      }
    }

    return minLng !== Infinity ? { minLng, maxLng, minLat, maxLat } : null;
  }, [data.features]);

  return {
    labelPoints,
    statesLabelPoints,
    dataExtent,
    featureIndex,
  } as const;
}
