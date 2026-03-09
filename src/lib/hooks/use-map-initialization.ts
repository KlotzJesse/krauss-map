import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useMapInitialization({
  mapContainer,
  data,
  center,
  zoom,
  style,
}: {
  mapContainer: RefObject<HTMLDivElement | null>;
  data: FeatureCollection;
  center: [number, number];
  zoom: number;
  style: string;
}) {
  const mapRef = useRef<MapLibreMap | null>(null);

  // Single state flag that gets set once when map loads
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Use useLayoutEffect for DOM container setup to ensure synchronous initialization
  // This prevents potential race conditions and ensures the map container is ready
  useLayoutEffect(() => {
    if (!mapContainer.current) return;
    if (!data || !data.features || data.features.length === 0) return;
    if (mapRef.current) return;

    (async () => {
      const maplibre = await import("maplibre-gl");
      const map = new maplibre.Map({
        container: mapContainer.current!,
        style,
        center,
        zoom,
        minZoom: 3,
        maxZoom: 18,
      });

      mapRef.current = map;

      // Listen for the load event once to trigger React re-render
      map.once("load", () => {
        setIsMapLoaded(true);
      });
    })();
  }, [center, data, zoom, mapContainer, style]);

  return {
    mapRef,
    isMapLoaded,
  };
}
