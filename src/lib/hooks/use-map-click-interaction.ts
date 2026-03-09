import type { Map as MapLibreMap } from "maplibre-gl";
import { toast } from "sonner";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { SelectAreaLayers } from "@/lib/schema/schema";
import { isFeatureWithCode } from "@/lib/utils/map-feature-utils";

type LayerWithPostalCodes = SelectAreaLayers & {
  postalCodes?: { postalCode: string }[];
};

/**
 * Hook for managing click interactions and feature selection
 * Optimized for performance with stable callbacks
 * Now adds postal codes directly to the active layer
 */
export function useMapClickInteraction(
  map: MapLibreMap | null,
  layersLoaded: boolean,
  isCursorMode: boolean,
  areaId?: number | null,
  activeLayerId?: number | null,
  layers?: LayerWithPostalCodes[],
  addPostalCodesToLayer?: (layerId: number, codes: string[]) => Promise<void>,
  removePostalCodesFromLayer?: (
    layerId: number,
    codes: string[]
  ) => Promise<void>
) {
  // Click handler for feature selection - adds to active layer
  const handleClick = useStableCallback(async (...args: unknown[]) => {
    if (!map || !layersLoaded || !isCursorMode) {
      return;
    }

    const e = args[0] as { features?: unknown[] };
    if (!e.features || e.features.length === 0) {
      return;
    }

    const feature = e.features[0];
    if (isFeatureWithCode(feature)) {
      const regionCode = feature.properties?.code;
      if (regionCode) {
        // Check if we have an active layer
        if (!areaId || !activeLayerId || areaId <= 0) {
          toast.info(
            `PLZ ${regionCode} - Bitte wählen Sie einen Bereich und aktiven Layer aus`,
            { duration: 3000 }
          );
          return;
        }

        // Check if we have the required functions
        if (!addPostalCodesToLayer || !removePostalCodesFromLayer) {
          toast.warning("Layer-Operationen nicht verfügbar", {
            duration: 2000,
          });
          return;
        }

        console.log(
          "[Click] AreaId:",
          areaId,
          "ActiveLayerId:",
          activeLayerId,
          "Available layers:",
          layers?.length || 0
        );

        // Find the active layer to check if postal code already exists
        const activeLayer = layers?.find((l) => l.id === activeLayerId);
        if (!activeLayer) {
          console.warn(
            "[Click] Active layer not found. Available layers:",
            layers?.map((l) => ({ id: l.id, name: l.name })) || []
          );
          toast.warning(
            `Aktiver Layer (ID: ${activeLayerId}) nicht gefunden. Verfügbare Layer: ${
              layers?.length || 0
            }`,
            { duration: 3000 }
          );
          return;
        }

        const existingCodes =
          activeLayer.postalCodes?.map((pc) => pc.postalCode) || [];
        const codeExists = existingCodes.includes(regionCode);

        console.log(
          "[Click] Layer:",
          activeLayer.name,
          "Code:",
          regionCode,
          "Exists:",
          codeExists,
          "Current codes:",
          existingCodes
        );

        try {
          if (codeExists) {
            // Remove if it exists
            console.log("[Click] Removing code from layer");
            await removePostalCodesFromLayer(activeLayerId, [regionCode]);
            toast.success(`PLZ ${regionCode} aus Gebiet entfernt`, {
              duration: 2000,
            });
          } else {
            // Add if it doesn't exist
            console.log("[Click] Adding code to layer");
            await addPostalCodesToLayer(activeLayerId, [regionCode]);
            toast.success(`PLZ ${regionCode} zu Gebiet hinzugefügt`, {
              duration: 2000,
            });
          }
        } catch (error) {
          console.error("Error toggling postal code:", error);
          toast.error(`Fehler beim Bearbeiten von PLZ ${regionCode}`, {
            duration: 2000,
          });
        }
      }
    }
  });

  return {
    handleClick,
  } as const;
}
