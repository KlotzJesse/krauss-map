import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useEffectEvent, useLayoutEffect } from "react";
import { flushSync } from "react-dom";

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
  // useEffectEvent: cursor style handlers — read latest map without being a dep
  const handleMouseDown = useEffectEvent(() => {
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

  const handleMouseUp = useEffectEvent(() => {
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

  // Wrap prop handlers as useEffectEvent so they aren't effect dependencies
  const onMouseEnter = useEffectEvent((...args: unknown[]) =>
    handleMouseEnter(...args)
  );
  const onMouseMove = useEffectEvent((...args: unknown[]) =>
    handleMouseMove(...args)
  );
  const onMouseLeave = useEffectEvent(() => handleMouseLeave());
  const onClick = useEffectEvent((...args: unknown[]) => handleClick(...args));

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

      map.on("mouseenter", targetLayer, onMouseEnter);
      map.on("mousemove", targetLayer, onMouseMove);
      map.on("mouseleave", targetLayer, onMouseLeave);
      map.on("click", targetLayer, onClick);
      attached = true;
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
        map.off("mouseenter", targetLayer, onMouseEnter);
        map.off("mousemove", targetLayer, onMouseMove);
        map.off("mouseleave", targetLayer, onMouseLeave);
        map.off("click", targetLayer, onClick);
      }

      map?.off("styledata", onStyleData);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    // All handlers are useEffectEvent — only structural deps remain
  }, [map, layerId, layersLoaded, isCursorMode]);
}
