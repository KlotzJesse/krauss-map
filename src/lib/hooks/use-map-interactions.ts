import type { PickingInfo } from "@deck.gl/core";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RefObject } from "react";
import { useCallback } from "react";
import { toast } from "sonner";

import { useMapDrawingTools } from "@/lib/hooks/use-map-drawing-tools";
import { useMapTerraDrawSelection } from "@/lib/hooks/use-map-terradraw-selection";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { useTerraDraw } from "@/lib/hooks/use-terradraw";
import type { SelectAreaLayers } from "@/lib/schema/schema";
import { getFeatureCode } from "@/lib/utils/deck-gl-utils";

type LayerWithPostalCodes = SelectAreaLayers & {
  postalCodes?: { postalCode: string }[];
};

interface UseMapInteractionsProps {
  mapRef: RefObject<MapLibreMap | null>;
  data: FeatureCollection<Polygon | MultiPolygon>;
  isMapLoaded: boolean;
  areaId?: number | null;
  activeLayerId?: number | null;
  layers?: LayerWithPostalCodes[];
  addPostalCodesToLayer?: (layerId: number, codes: string[]) => Promise<void>;
  removePostalCodesFromLayer?: (
    layerId: number,
    codes: string[]
  ) => Promise<void>;
}

/**
 * Comprehensive hook for managing all map interactions.
 * Combines drawing tools and TerraDraw functionality.
 * Hover and click are now handled by deck.gl picking (via useDeckLayers onHover + onClick callback).
 */
export function useMapInteractions({
  mapRef,
  data,
  isMapLoaded,
  areaId,
  activeLayerId,
  layers,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
}: UseMapInteractionsProps) {
  // Drawing tools state management
  const {
    currentDrawingMode,
    isDrawingToolsVisible,
    isCursorMode,
    isDrawingActive,
    handleDrawingModeChange,
    toggleToolsVisibility,
    showTools,
    hideTools,
    editingFeatureId,
    handleFeatureSelect,
    handleFeatureDeselect,
  } = useMapDrawingTools();

  // TerraDraw selection logic
  const {
    terraDrawRef,
    handleTerraDrawSelection,
    clearAll: clearAllDrawings,
    pendingPostalCodes,
    addPendingToSelection,
    removePendingFromSelection,
  } = useMapTerraDrawSelection({
    mapRef,
    data,
  });

  // TerraDraw integration
  const terraDrawApi = useTerraDraw({
    mapRef,
    isMapLoaded,
    isEnabled: isDrawingActive,
    mode: isDrawingActive ? currentDrawingMode : null,
    onSelectionChange: handleTerraDrawSelection,
    onFeatureSelect: handleFeatureSelect,
    onFeatureDeselect: handleFeatureDeselect,
  });

  // Always assign terraDrawRef for stability
  terraDrawRef.current = terraDrawApi;

  // Clear all drawings + pending postal codes + editing state
  const clearAll = useStableCallback(() => {
    clearAllDrawings();
    handleFeatureDeselect();
  });

  // Delete only the currently-selected drawing
  const deleteEditingFeature = useStableCallback(() => {
    if (!editingFeatureId) {
      return;
    }
    terraDrawApi.removeFeatures([editingFeatureId]);
    handleFeatureDeselect();
  });

  // Deselect the current drawing without deleting it
  const deselectEditingFeature = useStableCallback(() => {
    if (editingFeatureId) {
      terraDrawApi.deselectFeature(editingFeatureId);
    }
    handleFeatureDeselect();
  });

  // deck.gl click handler — replaces useMapClickInteraction
  const handleDeckClick = useCallback(
    async (info: PickingInfo) => {
      if (!isCursorMode || !info.object) {
        return;
      }

      const code = getFeatureCode(info.object);
      if (!code) {
        return;
      }

      if (!areaId || !activeLayerId || areaId <= 0) {
        toast.info(
          `PLZ ${code} - Bitte wählen Sie einen Bereich und aktiven Layer aus`,
          { duration: 3000 }
        );
        return;
      }

      if (!addPostalCodesToLayer || !removePostalCodesFromLayer) {
        toast.warning("Layer-Operationen nicht verfügbar", { duration: 2000 });
        return;
      }

      const activeLayer = layers?.find((l) => l.id === activeLayerId);
      if (!activeLayer) {
        toast.warning(
          `Aktiver Layer (ID: ${activeLayerId}) nicht gefunden. Verfügbare Layer: ${layers?.length || 0}`,
          { duration: 3000 }
        );
        return;
      }

      const existingCodesSet = new Set(
        activeLayer.postalCodes?.map((pc) => pc.postalCode)
      );
      const codeExists = existingCodesSet.has(code);

      try {
        if (codeExists) {
          await removePostalCodesFromLayer(activeLayerId, [code]);
          toast.success(`PLZ ${code} aus Gebiet entfernt`, { duration: 2000 });
        } else {
          await addPostalCodesToLayer(activeLayerId, [code]);
          toast.success(`PLZ ${code} zu Gebiet hinzugefügt`, {
            duration: 2000,
          });
        }
      } catch (error) {
        console.error("Error toggling postal code:", error);
        toast.error(`Fehler beim Bearbeiten von PLZ ${code}`, {
          duration: 2000,
        });
      }
    },
    [
      isCursorMode,
      areaId,
      activeLayerId,
      layers,
      addPostalCodesToLayer,
      removePostalCodesFromLayer,
    ]
  );

  return {
    // Drawing tools state
    currentDrawingMode,
    isDrawingToolsVisible,
    isCursorMode,
    isDrawingActive,
    // Drawing tools actions
    handleDrawingModeChange,
    toggleToolsVisibility,
    showTools,
    hideTools,
    clearAll,
    // Editing state
    editingFeatureId,
    deleteEditingFeature,
    deselectEditingFeature,
    // deck.gl click handler
    handleDeckClick,
    // TerraDraw API reference
    terraDrawRef,
    // Pending postal codes from drawing
    pendingPostalCodes,
    addPendingToSelection,
    removePendingFromSelection,
  } as const;
}
