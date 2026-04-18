import type { PickingInfo } from "@deck.gl/core";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RefObject } from "react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";

import { useMapDrawingTools } from "@/lib/hooks/use-map-drawing-tools";
import { useMapTerraDrawSelection } from "@/lib/hooks/use-map-terradraw-selection";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { useTerraDraw } from "@/lib/hooks/use-terradraw";
import type { SelectAreaLayers } from "@/lib/schema/schema";
import { getFeatureCode, getFeatureRawCode } from "@/lib/utils/deck-gl-utils";

type LayerWithPostalCodes = SelectAreaLayers & {
  postalCodes?: { postalCode: string }[];
};

export interface PlzReassignInfo {
  x: number;
  y: number;
  code: string;
  containingLayers: { id: number; name: string; color: string }[];
}

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
  /** Called instead of auto-adding when the PLZ already belongs to a different layer. */
  onNeedsReassign?: (info: PlzReassignInfo) => void;
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
  onNeedsReassign,
}: UseMapInteractionsProps) {
  // Drawing tools state management
  const {
    currentDrawingMode,
    isDrawingToolsVisible,
    isCursorMode,
    isDrawingActive,
    handleDrawingModeChange,
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

  // Synchronous flag: set when TerraDraw fires select/deselect on the same
  // click that deck.gl's onClick would also fire. Shape interactions always
  // take priority over postal-code toggling.
  const terraEventFiredRef = useRef(false);

  const guardedFeatureSelect = useStableCallback((id: string) => {
    terraEventFiredRef.current = true;
    handleFeatureSelect(id);
    requestAnimationFrame(() => {
      terraEventFiredRef.current = false;
    });
  });

  const guardedFeatureDeselect = useStableCallback(() => {
    terraEventFiredRef.current = true;
    handleFeatureDeselect();
    requestAnimationFrame(() => {
      terraEventFiredRef.current = false;
    });
  });

  // TerraDraw integration
  const terraDrawApi = useTerraDraw({
    mapRef,
    isMapLoaded,
    isEnabled: isDrawingActive,
    mode: isDrawingActive ? currentDrawingMode : null,
    onSelectionChange: handleTerraDrawSelection,
    onFeatureSelect: guardedFeatureSelect,
    onFeatureDeselect: guardedFeatureDeselect,
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
      // Shape interactions take priority over postal-code clicks
      if (terraEventFiredRef.current || editingFeatureId) {
        return;
      }

      if (!isCursorMode || !info.object) {
        return;
      }

      // Use raw code (without country prefix) for DB operations and display
      const rawCode = getFeatureRawCode(info.object);
      if (!rawCode) {
        return;
      }

      if (!areaId || !activeLayerId || areaId <= 0) {
        toast.info(
          `PLZ ${rawCode} - Bitte wählen Sie einen Bereich und aktiven Layer aus`,
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
      const codeExists = existingCodesSet.has(rawCode);

      // Find layers (other than active) that also contain this PLZ
      const otherLayersWithCode = (layers ?? []).filter(
        (l) =>
          l.id !== activeLayerId &&
          l.postalCodes?.some((pc) => pc.postalCode === rawCode)
      );

      try {
        if (codeExists) {
          // PLZ is in the active layer → remove it
          await removePostalCodesFromLayer(activeLayerId, [rawCode]);
          toast.success(`PLZ ${rawCode} aus Gebiet entfernt`, {
            duration: 2000,
          });
        } else if (otherLayersWithCode.length > 0 && onNeedsReassign) {
          // PLZ belongs to a different layer → ask user to reassign or duplicate
          onNeedsReassign({
            x: info.x ?? 0,
            y: info.y ?? 0,
            code: rawCode,
            containingLayers: otherLayersWithCode.map((l) => ({
              id: l.id,
              name: l.name,
              color: l.color ?? "#888",
            })),
          });
        } else {
          // PLZ not in any layer → add to active layer
          await addPostalCodesToLayer(activeLayerId, [rawCode]);
          toast.success(`PLZ ${rawCode} zu Gebiet hinzugefügt`, {
            duration: 2000,
          });
        }
      } catch {
        toast.error(`Fehler beim Bearbeiten von PLZ ${rawCode}`, {
          duration: 2000,
        });
      }
    },
    [
      isCursorMode,
      editingFeatureId,
      areaId,
      activeLayerId,
      layers,
      addPostalCodesToLayer,
      removePostalCodesFromLayer,
      onNeedsReassign,
    ]
  );

  return {
    // Drawing tools state
    currentDrawingMode,
    isDrawingToolsVisible,
    isCursorMode,
    // Drawing tools actions
    handleDrawingModeChange,
    showTools,
    hideTools,
    clearAll,
    // Editing state
    editingFeatureId,
    deleteEditingFeature,
    deselectEditingFeature,
    // deck.gl click handler
    handleDeckClick,
    // Pending postal codes from drawing
    pendingPostalCodes,
    addPendingToSelection,
    removePendingFromSelection,
  } as const;
}
