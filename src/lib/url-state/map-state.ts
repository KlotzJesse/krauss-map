import { useQueryState } from "nuqs";
import { useEffect, useMemo, useReducer, useRef, useTransition } from "react";

import { DACH_CENTER, DACH_ZOOM } from "../config/countries";
import { useStableCallback } from "../hooks/use-stable-callback";

const DEFAULT_CENTER = DACH_CENTER;
const DEFAULT_ZOOM = DACH_ZOOM;

function parseMapViewFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const raw = params.get("mapView");
  if (!raw)
    return { center: DEFAULT_CENTER as [number, number], zoom: DEFAULT_ZOOM };
  try {
    return JSON.parse(raw) as { center: [number, number]; zoom: number };
  } catch {
    return { center: DEFAULT_CENTER as [number, number], zoom: DEFAULT_ZOOM };
  }
}

// Reads mapView directly from window.location — bypasses nuqs to prevent
// the full Router cascade that fires on every replaceState during map pan.
// Only subscribes to popstate (back/forward navigation), not pan/zoom writes.
export function useMapView() {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    window.addEventListener("popstate", forceUpdate);
    return () => window.removeEventListener("popstate", forceUpdate);
  }, []);

  const parsed = parseMapViewFromSearch(
    typeof window !== "undefined" ? window.location.search : ""
  );

  const parsedLng = parsed.center[0];
  const parsedLat = parsed.center[1];

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

  const setMapView = useStableCallback(
    (view: { center: [number, number]; zoom: number }) => {
      const url = new URL(window.location.href);
      url.searchParams.set("mapView", JSON.stringify(view));
      window.history.replaceState(window.history.state, "", url.toString());
    }
  );

  return [{ center: stableCenter, zoom: parsed.zoom }, setMapView] as const;
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

// Writes mapView directly to URL — bypasses nuqs to prevent any re-render
// cascade during continuous pan/zoom. No nuqs subscription created.
export function useSetMapCenterZoom() {
  return useStableCallback((center: [number, number], zoom: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("mapView", JSON.stringify({ center, zoom }));
    window.history.replaceState(window.history.state, "", url.toString());
  });
}
