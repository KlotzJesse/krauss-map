import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import {
  getLargestPolygonCentroid,
  isPointInPolygon,
} from "@/lib/utils/map-data";
import type { MapLibreMap } from "@/types/map";

// Find features whose centroid is inside a polygon
export function useFindFeaturesInPolygon(
  data: FeatureCollection<Polygon | MultiPolygon>
) {
  return useStableCallback((polygon: number[][]): string[] => {
    if (!data || polygon.length < 3) {
      return [];
    }
    const selectedFeatures: string[] = [];
    for (const feature of data.features) {
      if (!feature?.geometry) {
        continue;
      }
      if (
        feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon"
      ) {
        continue;
      }
      const featureCode = feature.properties?.code;
      if (!featureCode) {
        continue;
      }
      const centroid = getLargestPolygonCentroid(
        feature as Feature<Polygon | MultiPolygon>
      );
      if (
        !centroid ||
        !Array.isArray(centroid) ||
        centroid.length !== 2 ||
        typeof centroid[0] !== "number" ||
        typeof centroid[1] !== "number"
      ) {
        continue;
      }
      if (
        isPointInPolygon(
          centroid as [number, number],
          polygon as [number, number][]
        )
      ) {
        selectedFeatures.push(featureCode);
      }
    }
    return selectedFeatures;
  });
}

// Find features whose centroid is within a circle
export function useFindFeaturesInCircle(
  data: FeatureCollection<Polygon | MultiPolygon>
) {
  return useStableCallback(
    (center: [number, number], radiusDegrees: number): string[] => {
      if (!data) {
        return [];
      }
      const selectedFeatures: string[] = [];
      for (const feature of data.features) {
        if (!feature?.geometry) {
          continue;
        }
        if (
          feature.geometry.type !== "Polygon" &&
          feature.geometry.type !== "MultiPolygon"
        ) {
          continue;
        }
        const featureCode = feature.properties?.code;
        if (!featureCode) {
          continue;
        }
        const centroid = getLargestPolygonCentroid(
          feature as Feature<Polygon | MultiPolygon>
        );
        if (!centroid) {
          continue;
        }
        const [lng1, lat1] = center;
        const [lng2, lat2] = centroid;
        const distance = Math.hypot(
          Math.abs(lat2 - lat1),
          Math.abs(lng2 - lng1)
        );
        if (distance <= radiusDegrees) {
          selectedFeatures.push(featureCode);
        }
      }
      return selectedFeatures;
    }
  );
}

// Convert pixel radius to geographic radius (degrees)
export function useConvertRadiusToGeographic(
  mapRef: React.RefObject<MapLibreMap | null>
) {
  return useStableCallback(
    (pixelRadius: number, center: [number, number]): number => {
      if (!mapRef.current) {
        return pixelRadius;
      }
      try {
        const zoom = mapRef.current.getZoom();
        const metersPerPixel =
          (156_543.033_92 * Math.cos((center[1] * Math.PI) / 180)) / 2 ** zoom;
        const geographicRadiusMeters = pixelRadius * metersPerPixel;
        const geographicRadiusDegrees = geographicRadiusMeters / 111_320;
        return geographicRadiusDegrees;
      } catch {
        return pixelRadius;
      }
    }
  );
}
