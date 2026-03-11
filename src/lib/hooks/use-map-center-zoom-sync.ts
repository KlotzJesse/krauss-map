import { useEffect, useEffectEvent, useLayoutEffect, useRef } from "react";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { MapLibreMap } from "@/types/map";

/**
 * useMapCenterZoomSync
 * Modular hook to persist and restore map center/zoom, and sync with URL or state.
 * Handles event listeners and state updates for map movement and zoom.
 *
 * @param mapRef - React ref to the map instance
 * @param isMapLoaded - boolean indicating if the map is loaded
 * @param center - [lng, lat] array for initial center
 * @param zoom - number for initial zoom
 * @param setMapCenterZoom - function to persist center/zoom (e.g. to URL state)
 */
export function useMapCenterZoomSync({
  mapRef,
  isMapLoaded,
  center,
  zoom,
  setMapCenterZoom,
}: {
  mapRef: React.RefObject<MapLibreMap | null>;
  isMapLoaded: boolean;
  center: [number, number];
  zoom: number;
  setMapCenterZoom: (center: [number, number], zoom: number) => void;
}) {
  // Memoized handler to update map center/zoom from props
  const updateMapView = useStableCallback(() => {
    if (!mapRef.current || !isMapLoaded) {
      return;
    }
    const currentCenter = mapRef.current.getCenter();
    const currentZoom = mapRef.current.getZoom();
    if (
      Array.isArray(center) &&
      center.length === 2 &&
      typeof center[0] === "number" &&
      typeof center[1] === "number" &&
      (Math.abs(currentCenter.lng - center[0]) > 1e-6 ||
        Math.abs(currentCenter.lat - center[1]) > 1e-6)
    ) {
      mapRef.current.setCenter({ lng: center[0], lat: center[1] });
    }
    if (Math.abs(currentZoom - zoom) > 1e-6) {
      mapRef.current.setZoom(zoom);
    }
  });

  // Debounce timer to throttle URL state writes on pan/zoom
  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useEffectEvent: reads latest mapRef/setMapCenterZoom without being an effect dep
  const handleMoveOrZoomEnd = useEffectEvent(() => {
    if (moveDebounceRef.current) {
      clearTimeout(moveDebounceRef.current);
    }
    moveDebounceRef.current = setTimeout(() => {
      if (mapRef.current) {
        const c = mapRef.current.getCenter();
        setMapCenterZoom([c.lng, c.lat], mapRef.current.getZoom());
      }
    }, 500);
  });

  // Use useLayoutEffect for synchronous map view updates to prevent visual flicker
  // This ensures the map position is updated before the browser paints
  useLayoutEffect(() => {
    updateMapView();
  }, [updateMapView]);

  // Use useEffect for event listeners since they don't affect layout immediately
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) {
      return;
    }
    const map = mapRef.current;
    mapRef.current.on("moveend", handleMoveOrZoomEnd);
    mapRef.current.on("zoomend", handleMoveOrZoomEnd);
    return () => {
      if (map) {
        map.off("moveend", handleMoveOrZoomEnd);
        map.off("zoomend", handleMoveOrZoomEnd);
      }
    };
    // mapRef is stable (React.RefObject), handleMoveOrZoomEnd is useEffectEvent — not real deps
  }, [isMapLoaded, mapRef]);
}
