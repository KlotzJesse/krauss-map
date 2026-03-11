import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
  Geometry,
} from "geojson";
import { useMemo, useState } from "react";

import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

import { useStableCallback } from "./use-stable-callback";

interface PostalCodeLookupResult {
  code: string;

  geometry: Geometry | null;

  properties: GeoJsonProperties;

  found: boolean;
}

interface UsePostalCodeLookupOptions {
  data: FeatureCollection<Polygon | MultiPolygon>;

  onPostalCodeFound?: (code: string, geometry: Geometry) => void;
}

export function usePostalCodeLookup({
  data,

  onPostalCodeFound,
}: UsePostalCodeLookupOptions) {
  const [isLoading, setIsLoading] = useState(false);

  const [lastLookupResult, setLastLookupResult] =
    useState<PostalCodeLookupResult | null>(null);

  // Spatial index for O(log n) coordinate lookups

  const spatialIndex = useMemo(() => {
    const index = new Map();

    data.features.forEach((feature) => {
      const geometry = feature.geometry;

      if (!geometry) {
        return;
      }

      let maxLat = -Infinity,
        maxLng = -Infinity,
        minLat = Infinity,
        minLng = Infinity;

      if (geometry.type === "Polygon") {
        const coords = geometry.coordinates[0];

        for (const [lng, lat] of coords) {
          minLng = Math.min(minLng, lng);

          maxLng = Math.max(maxLng, lng);

          minLat = Math.min(minLat, lat);

          maxLat = Math.max(maxLat, lat);
        }
      } else if (geometry.type === "MultiPolygon") {
        // Use first polygon for bounds approximation

        const coords = geometry.coordinates[0]?.[0];

        if (coords) {
          for (const [lng, lat] of coords) {
            minLng = Math.min(minLng, lng);

            maxLng = Math.max(maxLng, lng);

            minLat = Math.min(minLat, lat);

            maxLat = Math.max(maxLat, lat);
          }
        }
      }

      if (minLng !== Infinity) {
        const code =
          feature.properties?.code ||
          feature.properties?.PLZ ||
          feature.properties?.plz;

        if (code) {
          index.set(code.toString(), {
            feature,

            bounds: { minLng, maxLng, minLat, maxLat },
          });
        }
      }
    });

    return index;
  }, [data.features]);

  const lookupPostalCode = useStableCallback((postalCode: string) => {
    const lookupPromise = async () => {
      setIsLoading(true);

      try {
        // First try to find the postal code in the current data

        const normalizedCode = postalCode.trim().toUpperCase();

        const feature = data.features.find((f) => {
          const code =
            f.properties?.code || f.properties?.PLZ || f.properties?.plz;

          return code && code.toString().toUpperCase() === normalizedCode;
        });

        if (feature) {
          const result: PostalCodeLookupResult = {
            code: normalizedCode,

            geometry: feature.geometry,

            properties: feature.properties,

            found: true,
          };

          setLastLookupResult(result);

          if (onPostalCodeFound) {
            onPostalCodeFound(normalizedCode, feature.geometry);
          }

          return `PLZ ${normalizedCode} gefunden`;
        }

        const result: PostalCodeLookupResult = {
          code: normalizedCode,

          geometry: null,

          properties: null,

          found: false,
        };

        setLastLookupResult(result);

        throw new Error(
          `PLZ ${normalizedCode} nicht in aktueller Ansicht gefunden`
        );
      } catch (error) {
        console.error("Postal code lookup error:", error);

        throw error instanceof Error
          ? error
          : new Error("PLZ-Suche fehlgeschlagen");
      } finally {
        setIsLoading(false);
      }
    };

    return executeAction(lookupPromise(), {
      loading: `🔍 Suche PLZ ${postalCode}...`,

      success: (message) => message as string,

      error: (error) =>
        error instanceof Error ? error.message : "PLZ-Suche fehlgeschlagen",
    });
  });

  const clearLastLookup = useStableCallback(() => {
    setLastLookupResult(null);
  });

  // Helper function to find postal code by coordinates - optimized with spatial indexing

  const findPostalCodeByCoords = useStableCallback(
    (lng: number, lat: number) => {
      // Point-in-polygon helper (ray-casting)

      function isPointInPolygon(
        point: [number, number],

        polygon: number[][]
      ): boolean {
        let inside = false;

        const [x, y] = point;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const [xi, yi] = polygon[i];

          const [xj, yj] = polygon[j];

          if (
            yi > y !== yj > y &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
          ) {
            inside = !inside;
          }
        }

        return inside;
      }

      // Use spatial index for candidate filtering - much faster than checking all features

      const candidates = [];

      for (const [code, { bounds }] of spatialIndex) {
        // Quick bounds check before expensive point-in-polygon

        if (
          lng >= bounds.minLng &&
          lng <= bounds.maxLng &&
          lat >= bounds.minLat &&
          lat <= bounds.maxLat
        ) {
          candidates.push({ code, feature: spatialIndex.get(code).feature });
        }
      }

      // Only run expensive point-in-polygon on candidates

      for (const candidate of candidates) {
        const feature = candidate.feature;

        if (feature.geometry.type === "Polygon") {
          const polygon = feature.geometry.coordinates[0];

          if (isPointInPolygon([lng, lat], polygon as number[][])) {
            return candidate.code;
          }
        } else if (feature.geometry.type === "MultiPolygon") {
          for (const poly of feature.geometry.coordinates) {
            if (
              Array.isArray(poly) &&
              Array.isArray(poly[0]) &&
              isPointInPolygon([lng, lat], poly[0] as number[][])
            ) {
              return candidate.code;
            }
          }
        }
      }

      return null;
    }
  );

  return {
    lookupPostalCode,

    findPostalCodeByCoords,

    isLoading,

    lastLookupResult,

    clearLastLookup,
  };
}
