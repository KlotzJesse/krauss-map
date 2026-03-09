import type {
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RefObject } from "react";

import { useMapClickInteraction } from "@/lib/hooks/use-map-click-interaction";
import { useMapDrawingTools } from "@/lib/hooks/use-map-drawing-tools";
import { useMapEventListeners } from "@/lib/hooks/use-map-event-listeners";
import { useMapHoverInteraction } from "@/lib/hooks/use-map-hover-interaction";
import { useMapTerraDrawSelection } from "@/lib/hooks/use-map-terradraw-selection";
import { useTerraDraw } from "@/lib/hooks/use-terradraw";
import type { SelectAreaLayers } from "@/lib/schema/schema";

type LayerWithPostalCodes = SelectAreaLayers & {
  postalCodes?: { postalCode: string }[];
};

interface UseMapInteractionsProps {
  mapRef: RefObject<MapLibreMap | null>;

  layerId: string;

  data: FeatureCollection<Polygon | MultiPolygon>;

  isMapLoaded: boolean;

  layersLoaded: boolean;

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
 * Comprehensive hook for managing all map interactions
 * Combines drawing tools, hover, click, and TerraDraw functionality
 * Optimized for React 19 with minimal re-renders and maximum performance
 */

export function useMapInteractions({
  mapRef,

  layerId,

  data,

  isMapLoaded,

  layersLoaded,

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
  } = useMapDrawingTools();

  // TerraDraw selection logic - now managed per layer

  const {
    terraDrawRef,

    handleTerraDrawSelection,

    clearAll,

    pendingPostalCodes,

    addPendingToSelection,

    removePendingFromSelection,
  } = useMapTerraDrawSelection({
    mapRef,

    data,
  });

  // TerraDraw integration - initialize as soon as map is ready, don't wait for layers

  // CRITICAL: Pass the ref directly to avoid unstable map references that cause constant remounting

  const terraDrawApi = useTerraDraw({
    mapRef, // Pass the ref, let useTerraDraw handle the dereferencing

    isMapLoaded,

    isEnabled: isDrawingActive,

    mode: isDrawingActive ? currentDrawingMode : null,

    onSelectionChange: handleTerraDrawSelection,
  });

  // Always assign terraDrawRef for stability

  terraDrawRef.current = terraDrawApi;

  // Hover interaction management

  const {
    hoveredRegionIdRef,

    handleMouseEnter,

    handleMouseMove,

    handleMouseLeave,
  } = useMapHoverInteraction(
    mapRef.current,

    layerId,

    layersLoaded,

    isCursorMode
  );

  // Click interaction management - now adds to active layer

  const { handleClick } = useMapClickInteraction(
    mapRef.current,

    layersLoaded,

    isCursorMode,

    areaId,

    activeLayerId,

    layers,

    addPostalCodesToLayer,

    removePostalCodesFromLayer
  );

  // Event listeners management

  useMapEventListeners({
    map: mapRef.current,

    layerId,

    layersLoaded,

    isCursorMode,

    handleMouseEnter,

    handleMouseMove,

    handleMouseLeave,

    handleClick,
  });

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

    // Hover state

    hoveredRegionIdRef,

    // TerraDraw API reference

    terraDrawRef,

    // Pending postal codes from drawing

    pendingPostalCodes,

    addPendingToSelection,

    removePendingFromSelection,
  } as const;
}
