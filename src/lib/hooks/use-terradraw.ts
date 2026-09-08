import type { Map as MapLibre } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { RefObject } from "react";
// Types only — the drawing engine itself is imported on first use. It is about
// 90KB gzipped and nothing needs it until someone picks a drawing tool, so
// loading it with the map put it on the critical path for every visit.
import type { TerraDraw } from "terra-draw";

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
  /** Latched once a drawing tool is picked; nothing loads before that. */
  const [isRequested, setIsRequested] = useState(false);
  /** Flipped after the engine has loaded and started, to re-run the mode effect. */
  const [isReady, setIsReady] = useState(false);

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

  // Load on the first request for a real drawing mode, and never unload.
  useEffect(() => {
    if (isEnabled && mode && mode !== "cursor") {
      setIsRequested(true);
    }
  }, [isEnabled, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !isRequested || isInitializedRef.current) {
      return;
    }
    // Claim the slot before awaiting, so a second mode change during the import
    // cannot start a second engine on the same map.
    isInitializedRef.current = true;

    let cancelled = false;
    const init = async () => {
      const [
        {
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
        },
        { TerraDrawMapLibreGLAdapter },
      ] = await Promise.all([
        import("terra-draw"),
        import("terra-draw-maplibre-gl-adapter"),
      ]);
      if (cancelled) {
        return;
      }

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
            cursors: { start: "crosshair", close: "pointer" },
          }),
          new TerraDrawCircleMode({
            cursors: { start: "cell" },
          }),
          new TerraDrawPolygonMode({
            pointerDistance: 40,
            cursors: { start: "crosshair", close: "pointer" },
          }),
          new TerraDrawPointMode({
            cursors: { create: "copy" },
          }),
          new TerraDrawLineStringMode({
            pointerDistance: 40,
            cursors: { start: "crosshair", close: "pointer" },
          }),
          new TerraDrawRectangleMode({
            cursors: { start: "nw-resize" },
          }),
          new TerraDrawAngledRectangleMode({
            cursors: { start: "ne-resize" },
          }),
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
      setIsReady(true);
    };

    init().catch((error) => {
      console.error("[TerraDraw] Failed to initialize TerraDraw:", error);
      isInitializedRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [mapRef, isMapLoaded, isRequested]); // *Event callbacks are useEffectEvent — not deps

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

  const removeFeatures = useStableCallback((featureIds: string[]) => {
    if (!drawRef.current) {
      return;
    }
    drawRef.current.removeFeatures(featureIds);
  });

  const deselectFeature = useStableCallback((featureId: string) => {
    if (!drawRef.current) {
      return;
    }
    drawRef.current.deselectFeature(featureId);
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
        map.dragPan.disable();
        map.scrollZoom.disable();
        map.boxZoom.disable();
        map.doubleClickZoom.disable();
        map.keyboard.disable();

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
        map.getCanvas().style.cursor = "";

        onStopEvent();
      }
    } catch (error) {
      console.error("[TerraDraw] Error in mode change:", error);
    }
    // isReady re-runs this once the engine has loaded, so the mode the user
    // picked is applied even though it was requested before the import landed.
  }, [isEnabled, mode, mapRef, isReady]); // onStartEvent/onStopEvent are useEffectEvent — not deps

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
          currentMap.getCanvas().style.cursor = "";
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
    clearAll,
    getSnapshot,
    removeFeatures,
    deselectFeature,
  };
}
