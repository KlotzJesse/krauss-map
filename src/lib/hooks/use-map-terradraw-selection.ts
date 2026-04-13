import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useRef, useState } from "react";
import type { RefObject } from "react";
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
        return;
      }

      const allDrawFeatures = terraDrawRef.current?.getSnapshot() ?? [];
      const allSelectedFeatures: string[] = [];

      for (const featureId of featureIds) {
        const drawFeature = allDrawFeatures.find(
          (
            f
          ): f is {
            id: string | number;
            geometry?: Feature["geometry"];
            properties?: GeoJsonProperties & { radius?: number };
          } =>
            typeof f === "object" &&
            f !== null &&
            "id" in f &&
            (f as { id?: string | number }).id === featureId
        );

        if (!drawFeature) {
          continue;
        }

        // Handle polygon selection
        if (
          drawFeature.geometry &&
          drawFeature.geometry.type === "Polygon" &&
          Array.isArray(drawFeature.geometry.coordinates[0])
        ) {
          const polygon = drawFeature.geometry.coordinates[0] as [
            number,
            number,
          ][];

          if (polygon.length < 3) {
            continue;
          }

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
            continue;
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
          const center = drawFeature.geometry.coordinates as [number, number];
          const pixelRadius = drawFeature.properties.radius;

          if (
            !Array.isArray(center) ||
            center.length !== 2 ||
            typeof center[0] !== "number" ||
            typeof center[1] !== "number" ||
            isNaN(center[0]) ||
            isNaN(center[1])
          ) {
            continue;
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
        }
      }

      // Remove duplicates and store as pending selection
      const uniqueSelectedFeatures = [...new Set(allSelectedFeatures)];
      if (uniqueSelectedFeatures.length > 0) {
        setPendingPostalCodes(uniqueSelectedFeatures);

        // Provide toast feedback for drawing completion
        const count = uniqueSelectedFeatures.length;
        toast.info(`${count} Region${count === 1 ? "" : "en"} gefunden`, {
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

  // Clear pending selection and drawn shapes after adding to layer
  const addPendingToSelection = useStableCallback(() => {
    setPendingPostalCodes([]);
    if (terraDrawRef.current?.clearAll) {
      terraDrawRef.current.clearAll();
    }
  });

  // Remove pending postal codes from selection - clears pending
  const removePendingFromSelection = useStableCallback(() => {
    if (pendingPostalCodes.length > 0) {
      const removedCount = pendingPostalCodes.length;
      toast.success(
        `${removedCount} Region${removedCount === 1 ? "" : "en"} gelöscht`,
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
