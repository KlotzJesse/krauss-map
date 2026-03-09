import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { getLargestPolygonCentroid } from "@/lib/utils/map-data";

// Point-in-polygon helper (ray-casting)
export function usePointInPolygon() {
  return useStableCallback(
    (point: [number, number], polygon: [number, number][]): boolean => {
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
  );
}

// Find features whose centroid is inside a polygon
export function useFindFeaturesInPolygon(
  data: FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>
) {
  const isPointInPolygon = usePointInPolygon();
  return useStableCallback((polygon: number[][]): string[] => {
    if (!data || polygon.length < 3) {return [];}
    const selectedFeatures: string[] = [];
    data.features.forEach((feature) => {
      if (
        feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon"
      )
        {return;}
      const featureCode = feature.properties?.code;
      if (!featureCode) {return;}
      const centroid = getLargestPolygonCentroid(
        feature as Feature<Polygon | MultiPolygon, GeoJsonProperties>
      );
      if (!centroid) {return;}
      const isInside =
        Array.isArray(centroid) &&
        centroid.length === 2 &&
        typeof centroid[0] === "number" &&
        typeof centroid[1] === "number"
          ? isPointInPolygon(
              centroid as [number, number],
              polygon as [number, number][]
            )
          : false;
      if (isInside) {selectedFeatures.push(featureCode);}
    });
    return selectedFeatures;
  });
}

// Find features whose centroid is within a circle
export function useFindFeaturesInCircle(
  data: FeatureCollection<Polygon | MultiPolygon, GeoJsonProperties>
) {
  return useStableCallback(
    (center: [number, number], radiusDegrees: number): string[] => {
      if (!data) {return [];}
      const selectedFeatures: string[] = [];
      data.features.forEach((feature) => {
        if (
          feature.geometry.type !== "Polygon" &&
          feature.geometry.type !== "MultiPolygon"
        )
          {return;}
        const featureCode = feature.properties?.code;
        if (!featureCode) {return;}
        const centroid = getLargestPolygonCentroid(
          feature as Feature<Polygon | MultiPolygon, GeoJsonProperties>
        );
        if (!centroid) {return;}
        const [lng1, lat1] = center;
        const [lng2, lat2] = centroid;
        const dLat = Math.abs(lat2 - lat1);
        const dLng = Math.abs(lng2 - lng1);
        const distance = Math.sqrt(dLat * dLat + dLng * dLng);
        if (distance <= radiusDegrees) {selectedFeatures.push(featureCode);}
      });
      return selectedFeatures;
    }
  );
}

// Convert pixel radius to geographic radius (degrees)
import type { MapLibreMap } from "@/types/map";

export function useConvertRadiusToGeographic(
  mapRef: React.RefObject<MapLibreMap | null>
) {
  return useStableCallback(
    (pixelRadius: number, center: [number, number]): number => {
      if (!mapRef.current) {return pixelRadius;}
      try {
        const zoom = mapRef.current.getZoom();
        const metersPerPixel =
          (156_543.033_92 * Math.cos((center[1] * Math.PI) / 180)) /
          2 ** zoom;
        const geographicRadiusMeters = pixelRadius * metersPerPixel;
        const geographicRadiusDegrees = geographicRadiusMeters / 111_320;
        return geographicRadiusDegrees;
      } catch {
        return pixelRadius;
      }
    }
  );
}
