import { useQueryState } from "nuqs";
import { useMemo, useRef, useTransition } from "react";

import { DACH_CENTER, DACH_ZOOM } from "../config/countries";
import { useStableCallback } from "../hooks/use-stable-callback";

const DEFAULT_CENTER = DACH_CENTER;
const DEFAULT_ZOOM = DACH_ZOOM;

// Helper for atomic map view state
export function useMapView() {
  const [mapView, setMapViewRaw] = useQueryState("mapView");
  const defaultView = {
    center: DEFAULT_CENTER as [number, number],
    zoom: DEFAULT_ZOOM,
  };
  const parsed = mapView ? JSON.parse(mapView) : defaultView;

  // Extract primitive values for stable dependency tracking
  const parsedLng = parsed.center[0] as number;
  const parsedLat = parsed.center[1] as number;

  // Memoize center array to avoid new reference on every render
  const prevCenterRef = useRef<[number, number]>([parsedLng, parsedLat]);
  const stableCenter = useMemo(() => {
    const [prevLng, prevLat] = prevCenterRef.current;
    if (parsedLng === prevLng && parsedLat === prevLat) {
      return prevCenterRef.current;
    }
    const next: [number, number] = [parsedLng, parsedLat];
    prevCenterRef.current = next;
    return next;
  }, [parsedLng, parsedLat]);

  const setMapView = (view: { center: [number, number]; zoom: number }) =>
    setMapViewRaw(JSON.stringify(view));
  return [
    { center: stableCenter, zoom: parsed.zoom as number },
    setMapView,
  ] as const;
}

// Narrow hook: only active layer ID and setter (triggers server re-render)
export function useActiveLayerState() {
  const [isLayerPending, startLayerTransition] = useTransition();
  const [activeLayerId, setActiveLayerId] = useQueryState("activeLayerId", {
    shallow: false,
    startTransition: startLayerTransition,
  });

  const parsedActiveLayerId = useMemo(
    () => (activeLayerId ? Number.parseInt(activeLayerId, 10) : null),
    [activeLayerId]
  );

  const setActiveLayer = useStableCallback((id: number | null) => {
    setActiveLayerId(id !== null ? id.toString() : null);
  });

  return { activeLayerId: parsedActiveLayerId, isLayerPending, setActiveLayer };
}

// Narrow hook: only map center/zoom setter — bypasses useMapView subscription
// to avoid re-renders when the URL updates during continuous zoom/pan
export function useSetMapCenterZoom() {
  const [, setMapViewRaw] = useQueryState("mapView", {
    shallow: true,
    history: "replace",
  });
  return useStableCallback((center: [number, number], zoom: number) => {
    setMapViewRaw(JSON.stringify({ center, zoom }));
  });
}
