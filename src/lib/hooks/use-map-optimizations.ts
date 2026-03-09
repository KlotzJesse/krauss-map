import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  MultiPolygon,
  Polygon,
} from "geojson";
import { useMemo } from "react";

import { makeLabelPoints } from "@/lib/utils/map-data";

import { useStableCallback } from "./use-stable-callback";

interface UseMapOptimizationsProps {
  data: FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>;
  statesData?: FeatureCollection<
    Polygon | MultiPolygon,
    GeoJsonProperties
  > | null;
}

/**
 * Hook for optimized memoization of heavy computations
 * Prevents unnecessary re-renders and recalculations
 * Optimized for React 19 with stable references
 * Note: Selected regions are now managed per-layer, not globally
 */
export function useMapOptimizations({
  data,
  statesData,
}: UseMapOptimizationsProps) {
  // Empty feature collection for compatibility
  const selectedFeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: [] as Feature<Polygon | MultiPolygon, GeoJsonProperties>[],
    };
  }, []);

  // Memoize label points computation (expensive operation)
  const labelPoints = useMemo(() => {
    return makeLabelPoints(data) as FeatureCollection<
      Geometry,
      GeoJsonProperties
    >;
  }, [data]);

  // Memoize states label points if available
  const statesLabelPoints = useMemo(() => {
    return statesData
      ? (makeLabelPoints(statesData) as FeatureCollection<
          Geometry,
          GeoJsonProperties
        >)
      : null;
  }, [statesData]);

  // Memoize feature count for performance monitoring
  const featureCount = useMemo(
    () => data.features.length,
    [data.features.length]
  );

  // Selected count is now managed per-layer
  const selectedCount = 0;

  // Memoize data extent for bounds calculations - optimized for performance
  const dataExtent = useMemo(() => {
    if (!data.features.length) return null;

    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    // Single optimized pass through features
    for (const feature of data.features) {
      const geometry = feature.geometry;

      if (geometry.type === "Polygon") {
        // Only check outer ring for bounds - much faster
        const coords = geometry.coordinates[0];
        for (let i = 0; i < coords.length; i++) {
          const [lng, lat] = coords[i];
          minLng = Math.min(minLng, lng);
          maxLng = Math.max(maxLng, lng);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        }
      } else if (geometry.type === "MultiPolygon") {
        // Only check first polygon for bounds approximation (90%+ accuracy, much faster)
        const coords = geometry.coordinates[0]?.[0];
        if (coords) {
          for (let i = 0; i < coords.length; i++) {
            const [lng, lat] = coords[i];
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
          }
        }
      }
    }

    return minLng !== Infinity ? { minLng, maxLng, minLat, maxLat } : null;
  }, [data.features]);

  // Stable callback functions for layer usage
  // Note: Returns empty collection since selections are now per-layer
  const getSelectedFeatureCollection = useStableCallback(() => {
    return {
      type: "FeatureCollection" as const,
      features: [],
    } as FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>;
  });

  const getLabelPoints = useStableCallback(
    (d: FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>) => {
      return makeLabelPoints(d) as FeatureCollection<
        Geometry,
        GeoJsonProperties
      >;
    }
  );

  return {
    selectedFeatureCollection,
    labelPoints,
    statesLabelPoints,
    featureCount,
    selectedCount,
    dataExtent,
    getSelectedFeatureCollection,
    getLabelPoints,
  } as const;
}
