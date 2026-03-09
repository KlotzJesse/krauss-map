import type { MapLayerMouseEvent, Map as MapLibre } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { useStableCallback } from "./use-stable-callback";

interface CursorSelectionProps {
  map: MapLibre | null;
  isMapLoaded: boolean;
  layerId: string;
  enabled: boolean;
  selectedRegions?: string[];
  onRegionSelect?: (regionCode: string) => void;
  onRegionDeselect?: (regionCode: string) => void;
}

export function useCursorSelection({
  map,
  isMapLoaded,
  layerId,
  enabled,
  selectedRegions = [],
  onRegionSelect,
  onRegionDeselect,
}: CursorSelectionProps) {
  // Track last hovered region to avoid redundant setFilter calls
  const lastRegionIdRef = useRef<string | null>(null);
  const throttleTimeout = useRef<NodeJS.Timeout | null>(null);
  const pendingEvent = useRef<MapLayerMouseEvent | null>(null);

  // Click handler for selecting/deselecting regions
  const handleClick = useStableCallback((e: MapLayerMouseEvent) => {
    if (!map || !enabled || !e.features || e.features.length === 0) {return;}
    const feature = e.features[0];
    const regionCode = feature.properties?.code;
    if (regionCode) {
      if (selectedRegions.includes(regionCode)) {
        onRegionDeselect?.(regionCode);
      } else {
        onRegionSelect?.(regionCode);
      }
    }
  });

  // Throttled hover handler
  const processHover = useStableCallback((e: MapLayerMouseEvent) => {
    if (!map || !enabled) {return;}
    const hoverLayerId = `${layerId}-hover`;
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const regionCode = feature.properties?.code;
      if (regionCode && lastRegionIdRef.current !== regionCode) {
        map.setFilter(hoverLayerId, ["==", "code", regionCode]);
        map.setLayoutProperty(hoverLayerId, "visibility", "visible");
        map.getCanvas().style.cursor = "pointer";
        lastRegionIdRef.current = regionCode;
      }
    } else if (lastRegionIdRef.current !== null) {
        map.setLayoutProperty(hoverLayerId, "visibility", "none");
        map.getCanvas().style.cursor = "";
        lastRegionIdRef.current = null;
      }
  });

  // Throttle wrapper
  const handleMouseMove = useStableCallback((e: MapLayerMouseEvent) => {
    if (throttleTimeout.current) {
      pendingEvent.current = e;
      return;
    }
    processHover(e);
    throttleTimeout.current = setTimeout(() => {
      throttleTimeout.current = null;
      if (pendingEvent.current) {
        processHover(pendingEvent.current);
        pendingEvent.current = null;
      }
    }, 32); // ~30fps
  });

  const handleMouseLeave = useStableCallback(() => {
    if (!map || !enabled) {return;}
    const hoverLayerId = `${layerId}-hover`;
    map.getCanvas().style.cursor = "";
    map.setLayoutProperty(hoverLayerId, "visibility", "none");
    lastRegionIdRef.current = null;
  });

  useEffect(() => {
    if (!map || !isMapLoaded || !enabled) {return;}
    const mainLayerId = `${layerId}-layer`;
    map.on("click", mainLayerId, handleClick);
    map.on("mousemove", mainLayerId, handleMouseMove);
    map.on("mouseleave", mainLayerId, handleMouseLeave);
    return () => {
      if (map) {
        map.off("click", mainLayerId, handleClick);
        map.off("mousemove", mainLayerId, handleMouseMove);
        map.off("mouseleave", mainLayerId, handleMouseLeave);
      }
      if (throttleTimeout.current) {
        clearTimeout(throttleTimeout.current);
        throttleTimeout.current = null;
      }
      pendingEvent.current = null;
      lastRegionIdRef.current = null;
    };
  }, [
    map,
    isMapLoaded,
    enabled,
    layerId,
    handleClick,
    handleMouseMove,
    handleMouseLeave,
  ]);
}
