import type { Map as MapLibre } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";
import type { RefObject } from "react";
import {
  TerraDraw,
  TerraDrawAngledRectangleMode,
  TerraDrawCircleMode,
  TerraDrawFreehandMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSectorMode,
  TerraDrawSelectMode,
} from "terra-draw";
import type { GeoJSONStoreFeatures } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";

// Define all available drawing modes
export type TerraDrawMode =
  | "cursor" // Cursor selection (not a TerraDraw mode, but our custom mode)
  | "freehand" // Lasso selection
  | "circle" // Radius selection
  | "polygon" // Regular polygon
  | "point" // Single point
  | "linestring" // Line/path
  | "rectangle" // Rectangle
  | "angled-rectangle"; // Angled rectangle

// Props for useTerraDraw hook
export interface UseTerraDrawProps {
  mapRef: RefObject<MapLibre | null>; // Changed from map to mapRef
  isMapLoaded: boolean; // Added for better control
  isEnabled: boolean;
  mode: TerraDrawMode | null;
  onSelectionChange?: (features: (string | number)[]) => void;
  onFeatureSelect?: (featureId: string) => void;
  onFeatureDeselect?: () => void;
  onStart?: () => void;
  onStop?: () => void;
}

// Invariant: All hooks must always be called, and dependency arrays must be stable.
// This hook must always be called unconditionally in the component tree, even if map is not ready (pass null).
export function useTerraDraw({
  mapRef,
  isMapLoaded,
  isEnabled,
  mode,
  onSelectionChange,
  onFeatureSelect,
  onFeatureDeselect,
  onStart,
  onStop,
}: UseTerraDrawProps) {
  const drawRef = useRef<TerraDraw | null>(null);
  const isInitializedRef = useRef(false);

  // useEffectEvent: read latest prop callbacks without being effect deps
  const onSelectionChangeEvent = useEffectEvent(
    (features: (string | number)[]) => {
      onSelectionChange?.(features);
    }
  );

  const onStartEvent = useEffectEvent(() => {
    onStart?.();
  });

  const onStopEvent = useEffectEvent(() => {
    onStop?.();
  });

  const onFeatureSelectEvent = useEffectEvent((featureId: string) => {
    onFeatureSelect?.(featureId);
  });

  const onFeatureDeselectEvent = useEffectEvent(() => {
    onFeatureDeselect?.();
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || isInitializedRef.current) {
      return;
    }

    try {
      // Create adapter with explicit configuration
      const adapter = new TerraDrawMapLibreGLAdapter({
        map,
      });

      // Shared selection flags for draggable features with editable coordinates
      const draggableWithCoords = {
        feature: {
          draggable: true,
          coordinates: {
            midpoints: true,
            draggable: true,
            deletable: true,
          },
        },
      };
      // Simpler flags for shapes where coordinate editing isn't useful
      const draggableOnly = {
        feature: { draggable: true },
      };

      const draw = new TerraDraw({
        adapter,
        modes: [
          // flags tell select mode which drawing modes' features are selectable
          new TerraDrawSelectMode({
            flags: {
              freehand: draggableWithCoords,
              polygon: draggableWithCoords,
              linestring: draggableWithCoords,
              circle: draggableOnly,
              rectangle: draggableOnly,
              "angled-rectangle": draggableOnly,
              sector: draggableOnly,
              point: draggableOnly,
            },
          }),
          new TerraDrawFreehandMode({
            pointerDistance: 40,
            minDistance: 10,
          }),
          new TerraDrawCircleMode(),
          new TerraDrawPolygonMode({
            pointerDistance: 40,
          }),
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode({
            pointerDistance: 40,
          }),
          new TerraDrawRectangleMode(),
          new TerraDrawAngledRectangleMode(),
          new TerraDrawSectorMode(),
        ],
      });

      draw.on("select", (id: string | number) => {
        onFeatureSelectEvent(String(id));
      });

      draw.on("deselect", () => {
        onFeatureDeselectEvent();
      });

      draw.on(
        "finish",
        (_id: string | number, context: { action: string; mode: string }) => {
          try {
            if (context.action === "draw") {
              const allFeatures = draw.getSnapshot();

              const featureIds = allFeatures.map((feature) => feature.id);
              if (featureIds.length > 0) {
                onSelectionChangeEvent(
                  featureIds.filter((id) => id !== undefined && id !== null)
                );
              }
            }
          } catch (error) {
            console.error("[TerraDraw] Error in finish event:", error);
          }
        }
      );

      draw.start();
      draw.setMode("select");

      drawRef.current = draw;
      isInitializedRef.current = true;
    } catch (error) {
      console.error("[TerraDraw] Failed to initialize TerraDraw:", error);
      isInitializedRef.current = false;
    }
  }, [mapRef, isMapLoaded]); // onSelectionChangeEvent is useEffectEvent — not a dep

  const clearAll = useStableCallback(() => {
    if (!drawRef.current) {
      return;
    }

    try {
      drawRef.current.clear();
    } catch (error) {
      console.error("Failed to clear drawings:", error);
    }
  });

  const getSnapshot = useStableCallback(() => {
    if (!drawRef.current) {
      return [];
    }
    return drawRef.current.getSnapshot();
  });

  const addFeatures = useStableCallback((features: GeoJSONStoreFeatures[]) => {
    if (!drawRef.current) {
      return [];
    }
    return drawRef.current.addFeatures(features);
  });

  const removeFeatures = useStableCallback((featureIds: string[]) => {
    if (!drawRef.current) {
      return;
    }
    drawRef.current.removeFeatures(featureIds);
  });

  const selectFeature = useStableCallback((featureId: string) => {
    if (!drawRef.current) {
      return;
    }
    drawRef.current.selectFeature(featureId);
  });

  const deselectFeature = useStableCallback((featureId: string) => {
    if (!drawRef.current) {
      return;
    }
    drawRef.current.deselectFeature(featureId);
  });

  const getModeState = useStableCallback(() => {
    if (!drawRef.current) {
      return null;
    }
    return drawRef.current.getModeState();
  });

  // Handle mode changes with stable callbacks
  useEffect(() => {
    const map = mapRef.current;

    if (!drawRef.current || !isInitializedRef.current || !map) {
      return;
    }

    try {
      // Check if TerraDraw is started
      let isStarted = false;
      try {
        const currentModeState = drawRef.current.getModeState();
        isStarted = !!currentModeState;
      } catch {
        isStarted = false;
      }

      // Ensure TerraDraw is started
      if (!isStarted) {
        drawRef.current.start();
        drawRef.current.setMode("select");
      }

      // Now handle mode switching
      if (isEnabled && mode && mode !== "cursor") {
        // Disable map interactions BEFORE setting mode

        map.dragPan.disable();
        map.scrollZoom.disable();
        map.boxZoom.disable();
        map.doubleClickZoom.disable();
        map.keyboard.disable();
        map.getContainer().style.cursor = "crosshair";

        // Set the drawing mode

        drawRef.current.setMode(mode);

        // Force a repaint to ensure events are properly attached
        //map.triggerRepaint();

        onStartEvent();
      } else {
        // Set to select mode
        drawRef.current.setMode("select");

        // Re-enable map interactions

        map.dragPan.enable();
        map.scrollZoom.enable();
        map.boxZoom.enable();
        map.doubleClickZoom.enable();
        map.keyboard.enable();
        map.getContainer().style.cursor = "";

        onStopEvent();
      }
    } catch (error) {
      console.error("[TerraDraw] Error in mode change:", error);
    }
  }, [isEnabled, mode, mapRef]); // onStartEvent/onStopEvent are useEffectEvent — not deps

  // Cleanup on unmount
  useEffect(() => {
    const currentMap = mapRef.current; // Capture the current map instance
    return () => {
      try {
        if (drawRef.current && currentMap) {
          // Guard: react-map-gl may call map.remove() before our cleanup runs,
          // which sets map.style to null. getStyle() returns undefined after remove().
          if (!currentMap.getStyle()) {
            return;
          }

          if (
            drawRef.current.enabled ||
            (drawRef.current as unknown as { _enabled?: boolean })._enabled
          ) {
            drawRef.current.stop();
          }
          try {
            drawRef.current.clear();
          } catch {
            // ignore if clearing fails
          }
          // Re-enable all map interactions
          currentMap.dragPan.enable();
          currentMap.scrollZoom.enable();
          currentMap.boxZoom.enable();
          currentMap.doubleClickZoom.enable();
          currentMap.keyboard.enable();
          currentMap.getContainer().style.cursor = "";
        }
      } catch (error) {
        // Only log if map is still alive (unexpected error vs expected removal race)
        try {
          if (currentMap?.getStyle()) {
            console.error("Error during TerraDraw cleanup:", error);
          }
        } catch {
          // map is gone — expected during unmount
        }
      } finally {
        drawRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [mapRef]); // Include mapRef dependency for cleanup

  return {
    isInitialized: isInitializedRef.current,
    clearAll,
    getSnapshot,
    addFeatures,
    removeFeatures,
    selectFeature,
    deselectFeature,
    getModeState,
  };
}
