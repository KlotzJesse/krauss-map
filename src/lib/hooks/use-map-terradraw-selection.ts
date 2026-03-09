import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { toast } from "sonner";

import {
  useConvertRadiusToGeographic,
  useFindFeaturesInCircle,
  useFindFeaturesInPolygon,
} from "@/components/shared/hooks/use-feature-selection";

import { useStableCallback } from "./use-stable-callback";

interface UseMapTerraDrawSelectionProps {
  mapRef: RefObject<MapLibreMap | null>;
  data: FeatureCollection<Polygon | MultiPolygon>;
}

/**
 * Hook for managing TerraDraw selection logic
 * Handles polygon and circle selections with geographic coordinate conversion
 * Optimized for React 19 with memoized callbacks and stable references
 * Note: Selections are now managed through pending postal codes only, actual persistence through layers
 */
export function useMapTerraDrawSelection({
  mapRef,
  data,
}: UseMapTerraDrawSelectionProps) {
  // Ref to store TerraDraw API
  const terraDrawRef = useRef<{
    getSnapshot: () => unknown[];
    clearAll: () => void;
  } | null>(null);

  // State for pending postal codes from drawing
  const [pendingPostalCodes, setPendingPostalCodes] = useState<string[]>([]);

  // Feature selection hooks
  const findFeaturesInPolygon = useFindFeaturesInPolygon(data);
  const findFeaturesInCircle = useFindFeaturesInCircle(data);
  const convertRadiusToGeographic = useConvertRadiusToGeographic(mapRef);

  // Handle TerraDraw selection changes
  const handleTerraDrawSelection = useStableCallback(
    (featureIds: (string | number)[]) => {
      if (!featureIds || featureIds.length === 0) {
        console.log("[useMapTerraDrawSelection] No feature IDs provided");
        return;
      }

      const allDrawFeatures = terraDrawRef.current?.getSnapshot() ?? [];
      console.log(
        "[useMapTerraDrawSelection] All TerraDraw features:",
        allDrawFeatures
      );

      // Process ALL feature IDs, not just the last one
      const allSelectedFeatures: string[] = [];

      featureIds.forEach((featureId, index) => {
        console.log(
          `[useMapTerraDrawSelection] Processing feature ID ${index + 1}/${
            featureIds.length
          }:`,
          featureId
        );

        // Inline type guard for drawFeature
        const drawFeature = allDrawFeatures.find(
          (
            f
          ): f is {
            id: string | number;
            geometry?: Feature["geometry"];
            properties?: GeoJsonProperties & { radius?: number };
          } => (
              typeof f === "object" &&
              f !== null &&
              "id" in f &&
              (f as { id?: string | number }).id === featureId
            )
        );

        if (!drawFeature) {
          console.log(
            "[useMapTerraDrawSelection] No valid draw feature found for ID:",
            featureId
          );
          return;
        }

        // Handle polygon selection
        if (
          drawFeature.geometry &&
          drawFeature.geometry.type === "Polygon" &&
          Array.isArray(drawFeature.geometry.coordinates[0])
        ) {
          console.log(
            "[useMapTerraDrawSelection] Processing polygon selection"
          );

          const polygon = drawFeature.geometry.coordinates[0] as [
            number,
            number,
          ][];
          console.log(
            "[useMapTerraDrawSelection] Polygon coordinates:",
            polygon
          );

          // Ensure polygon has at least 3 points
          if (polygon.length < 3) {
            console.log(
              "[useMapTerraDrawSelection] Polygon has less than 3 points, skipping"
            );
            return;
          }

          // Ensure all coordinates are valid numbers
          const validPolygon = polygon.filter(
            (coord): coord is [number, number] =>
              Array.isArray(coord) &&
              coord.length === 2 &&
              typeof coord[0] === "number" &&
              typeof coord[1] === "number" &&
              !isNaN(coord[0]) &&
              !isNaN(coord[1])
          );

          if (validPolygon.length < 3) {
            console.log(
              "[useMapTerraDrawSelection] Not enough valid coordinates"
            );
            return;
          }

          // Convert coordinates if needed (TerraDraw might use screen coordinates)
          const geographicPolygon = validPolygon.map((coord) => {
            if (
              coord[0] > 180 ||
              coord[0] < -180 ||
              coord[1] > 90 ||
              coord[1] < -90
            ) {
              const point = mapRef.current?.unproject(coord);
              return point
                ? ([point.lng, point.lat] as [number, number])
                : coord;
            }
            return coord;
          });

          const selectedFeatures = findFeaturesInPolygon(geographicPolygon);
          allSelectedFeatures.push(...selectedFeatures);
        }
        // Handle circle selection
        else if (
          drawFeature.geometry &&
          drawFeature.geometry.type === "Point" &&
          drawFeature.properties?.radius &&
          drawFeature.geometry.coordinates
        ) {
          console.log("[useMapTerraDrawSelection] Processing circle selection");

          const center = drawFeature.geometry.coordinates as [number, number];
          const pixelRadius = drawFeature.properties.radius;
          console.log(
            "[useMapTerraDrawSelection] Circle center:",
            center,
            "pixel radius:",
            pixelRadius
          );

          // Ensure center coordinates are valid
          if (
            !Array.isArray(center) ||
            center.length !== 2 ||
            typeof center[0] !== "number" ||
            typeof center[1] !== "number" ||
            isNaN(center[0]) ||
            isNaN(center[1])
          ) {
            console.log(
              "[useMapTerraDrawSelection] Invalid center coordinates"
            );
            return;
          }

          // Convert coordinates if needed
          let geographicCenter = center;
          if (
            center[0] > 180 ||
            center[0] < -180 ||
            center[1] > 90 ||
            center[1] < -90
          ) {
            const point = mapRef.current?.unproject(center);
            geographicCenter = point
              ? ([point.lng, point.lat] as [number, number])
              : center;
          }

          const geographicRadius = convertRadiusToGeographic(
            pixelRadius,
            geographicCenter
          );
          const selectedFeatures = findFeaturesInCircle(
            geographicCenter,
            geographicRadius
          );
          allSelectedFeatures.push(...selectedFeatures);
        } else if (drawFeature.geometry) {
          console.log(
            "[useMapTerraDrawSelection] Unsupported geometry type:",
            drawFeature.geometry.type
          );
        }
      });

      // Remove duplicates and store as pending selection
      const uniqueSelectedFeatures = [...new Set(allSelectedFeatures)];
      if (uniqueSelectedFeatures.length > 0) {
        setPendingPostalCodes(uniqueSelectedFeatures);

        // Provide toast feedback for drawing completion
        const count = uniqueSelectedFeatures.length;
        toast.info(`🎯 ${count} Region${count === 1 ? "" : "en"} gefunden`, {
          description: `Klicken Sie auf "Hinzufügen" oder "Entfernen"`,
          duration: 3000,
        });
      }
    }
  );

  // Clear all drawn features
  const clearAll = useStableCallback(() => {
    if (terraDrawRef.current?.clearAll) {
      terraDrawRef.current.clearAll();
    }
    setPendingPostalCodes([]);
  });

  // Add pending postal codes to selection - now does nothing since handled by drawing tools
  const addPendingToSelection = useStableCallback(() => {
    console.log(
      "[addPendingToSelection] This should not be called - use layer operations instead"
    );
    // This function is deprecated - the drawing tools should handle layer operations directly
  });

  // Remove pending postal codes from selection - clears pending
  const removePendingFromSelection = useStableCallback(() => {
    if (pendingPostalCodes.length > 0) {
      const removedCount = pendingPostalCodes.length;
      toast.success(
        `🗑️ ${removedCount} Region${removedCount === 1 ? "" : "en"} gelöscht`,
        {
          duration: 2000,
        }
      );

      setPendingPostalCodes([]);
      if (terraDrawRef.current?.clearAll) {
        terraDrawRef.current.clearAll();
      }
    }
  });

  return {
    terraDrawRef,
    handleTerraDrawSelection,
    clearAll,
    pendingPostalCodes,
    addPendingToSelection,
    removePendingFromSelection,
  } as const;
}
