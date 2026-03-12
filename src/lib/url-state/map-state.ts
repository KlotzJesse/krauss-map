import { useQueryState } from "nuqs";
import { useMemo, useTransition } from "react";

import { useStableCallback } from "../hooks/use-stable-callback";

// Helper for atomic map view state
export function useMapView() {
  const [mapView, setMapViewRaw] = useQueryState("mapView");
  // mapView: { center: [lng, lat], zoom: number }
  const defaultView = { center: [10.4515, 51.1657], zoom: 5 };
  const parsed = mapView ? JSON.parse(mapView) : defaultView;
  const setMapView = (view: { center: [number, number]; zoom: number }) =>
    setMapViewRaw(JSON.stringify(view));
  return [
    parsed as { center: [number, number]; zoom: number },
    setMapView,
  ] as const;
}

// Hook for managing all map state (Optimized v4 - with layer support)
export function useMapState() {
  // --- Atomic map view state ---
  const [mapView, setMapView] = useMapView();
  // ---
  const [granularity, setGranularity] = useQueryState("granularity");
  const [radius, setRadius] = useQueryState("radius");

  // Track server re-render while switching active layer (shallow: false triggers full RSC reload)
  const [isLayerPending, startLayerTransition] = useTransition();

  // Layer management (activeLayerId and versionId remain as search params)
  const [activeLayerId, setActiveLayerId] = useQueryState("activeLayerId", {
    shallow: false,
    startTransition: startLayerTransition,
  });
  const [versionId, setVersionId] = useQueryState("versionId");

  // Parse layer IDs
  const parsedActiveLayerId = useMemo(
    () => (activeLayerId ? parseInt(activeLayerId, 10) : null),
    [activeLayerId]
  );

  const parsedVersionId = useMemo(
    () => (versionId ? parseInt(versionId, 10) : null),
    [versionId]
  );

  // --- Atomic map view helpers ---
  const setMapCenterZoom = useStableCallback(
    (center: [number, number], zoom: number) => {
      setMapView({ center, zoom });
    }
  );

  // Layer helpers
  const setActiveLayer = useStableCallback((id: number | null) => {
    setActiveLayerId(id !== null ? id.toString() : null);
  });

  const setVersion = useStableCallback((id: number | null) => {
    setVersionId(id !== null ? id.toString() : null);
  });

  return {
    granularity: granularity || "1digit",
    center: mapView.center,
    zoom: mapView.zoom,
    radius: radius ? parseInt(radius, 10) : 10,
    activeLayerId: parsedActiveLayerId,
    versionId: parsedVersionId,
    isLayerPending,
    setGranularity,
    setMapCenterZoom, // atomic
    setRadius: useStableCallback((radiusValue: number) =>
      setRadius(radiusValue.toString())
    ),
    setActiveLayer,
    setVersion,
  };
}
