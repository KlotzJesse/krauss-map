import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useLayoutEffect } from "react";
import { flushSync } from "react-dom";

import { useStableCallback } from "./use-stable-callback";

interface UseMapEventListenersProps {
  map: MapLibreMap | null;
  layerId: string;
  layersLoaded: boolean;
  isCursorMode: boolean;
  handleMouseEnter: (...args: unknown[]) => void;
  handleMouseMove: (...args: unknown[]) => void;
  handleMouseLeave: () => void;
  handleClick: (...args: unknown[]) => void;
}

/**
 * Hook for managing map event listeners
 * Handles attachment/detachment of mouse events for cursor mode
 * Optimized for React 19 with proper cleanup
 */
export function useMapEventListeners({
  map,
  layerId,
  layersLoaded,
  isCursorMode,
  handleMouseEnter,
  handleMouseMove,
  handleMouseLeave,
  handleClick,
}: UseMapEventListenersProps) {
  // Cursor style handlers with flushSync for synchronous updates
  const handleMouseDown = useStableCallback(() => {
    if (!map) {
      return;
    }
    flushSync(() => {
      const canvas = map.getCanvas();
      if (canvas) {
        canvas.style.cursor = "grabbing";
      }
    });
  });

  const handleMouseUp = useStableCallback(() => {
    if (!map) {
      return;
    }
    flushSync(() => {
      const canvas = map.getCanvas();
      if (canvas) {
        canvas.style.cursor = "grab";
      }
    });
  });

  // Use useLayoutEffect for cursor style updates to prevent visual flicker
  // This ensures cursor changes are applied synchronously before paint
  useLayoutEffect(() => {
    if (!map || !layersLoaded || !isCursorMode) {
      return;
    }

    const canvas = map.getCanvas();
    canvas.style.cursor = "grab";

    return () => {
      // Reset cursor on cleanup
      canvas.style.cursor = "grab";
    };
  }, [map, layersLoaded, isCursorMode]);

  // Use useEffect for event listeners since they don't affect layout immediately
  useEffect(() => {
    if (!map || !layersLoaded || !isCursorMode) {
      return;
    }

    const canvas = map.getCanvas();
    const targetLayer = `${layerId}-layer`;
    let attached = false;

    // Handler to attach event listeners when the layer is present
    function attachHandlers() {
      if (!map || !map.getLayer(targetLayer) || attached) {
        return;
      }

      map.on("mouseenter", targetLayer, handleMouseEnter);
      map.on("mousemove", targetLayer, handleMouseMove);
      map.on("mouseleave", targetLayer, handleMouseLeave);
      map.on("click", targetLayer, handleClick);
      attached = true;

      console.debug(
        "[useMapEventListeners] Cursor mode listeners attached to layer:",
        targetLayer
      );
    }

    // Listen for 'styledata' event to re-attach handlers after style reloads
    function onStyleData() {
      attachHandlers();
    }

    map.on("styledata", onStyleData);

    // Attach immediately if layer is already present
    attachHandlers();

    // Add cursor style handlers (synchronous DOM updates)
    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (map && attached) {
        map.off("mouseenter", targetLayer, handleMouseEnter);
        map.off("mousemove", targetLayer, handleMouseMove);
        map.off("mouseleave", targetLayer, handleMouseLeave);
        map.off("click", targetLayer, handleClick);
        console.debug(
          "[useMapEventListeners] Cursor mode listeners detached from layer:",
          targetLayer
        );
      }

      map?.off("styledata", onStyleData);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    map,
    layerId,
    layersLoaded,
    isCursorMode,
    handleMouseEnter,
    handleMouseMove,
    handleMouseLeave,
    handleClick,
    handleMouseDown,
    handleMouseUp,
  ]);
}
