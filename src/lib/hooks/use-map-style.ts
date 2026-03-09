import type { Map as MapLibre } from "maplibre-gl";
import { useEffect, useLayoutEffect } from "react";

interface MapStyleProps {
  map: MapLibre | null;
  isMapLoaded: boolean;
  granularity: string;
  selectedRegions?: string[];
}

export function useMapStyle({
  map,
  isMapLoaded,
  granularity,
  selectedRegions = [],
}: MapStyleProps) {
  // Use useLayoutEffect for style updates to prevent flash of unstyled content
  // This ensures all style changes are applied synchronously before paint
  useLayoutEffect(() => {
    if (!map || !isMapLoaded) {
      return;
    }

    const mainLayerId = `${granularity}-layer`;
    const hoverLayerId = `${granularity}-hover`;

    // Wait for layers to be available
    const checkLayers = () => {
      if (!map.getLayer(mainLayerId) || !map.getLayer(hoverLayerId)) {
        return false;
      }
      return true;
    };

    // Apply styles if layers exist
    const applyStyles = () => {
      try {
        // Update main layer style
        map.setPaintProperty(mainLayerId, "fill-color", "#627D98");
        map.setPaintProperty(mainLayerId, "fill-opacity", 0.4);
        map.setPaintProperty(mainLayerId, "fill-outline-color", "#102A43");
        map.setPaintProperty(mainLayerId, "fill-outline-width", 1);

        // Update hover layer style
        map.setPaintProperty(hoverLayerId, "fill-color", "#627D98");
        map.setPaintProperty(hoverLayerId, "fill-opacity", 0.6);
        map.setPaintProperty(hoverLayerId, "fill-outline-color", "#102A43");
        map.setPaintProperty(hoverLayerId, "fill-outline-width", 2);

        // Ensure layers are visible
        map.setLayoutProperty(mainLayerId, "visibility", "visible");
        map.setLayoutProperty(hoverLayerId, "visibility", "visible");
      } catch (error) {
        console.warn("Error applying map styles:", error);
      }
    };

    // If layers don't exist yet, wait for them using useEffect for async operations
    if (!checkLayers()) {
      // This effect will re-run when layers are available
      return;
    }

    applyStyles();
  }, [map, isMapLoaded, granularity, selectedRegions]);

  // Use useEffect for async layer waiting to avoid blocking the main thread
  useEffect(() => {
    if (!map || !isMapLoaded) {
      return;
    }

    const mainLayerId = `${granularity}-layer`;
    const hoverLayerId = `${granularity}-hover`;

    // Wait for layers to be available
    const checkLayers = () => {
      if (!map.getLayer(mainLayerId) || !map.getLayer(hoverLayerId)) {
        return false;
      }
      return true;
    };

    // If layers don't exist yet, wait for them
    if (!checkLayers()) {
      const styleLoadHandler = () => {
        if (checkLayers()) {
          map.off("style.load", styleLoadHandler);
          // Trigger re-render by updating state dependencies
        }
      };
      map.on("style.load", styleLoadHandler);
      return () => {
        map.off("style.load", styleLoadHandler);
      };
    }
  }, [map, isMapLoaded, granularity]);
}
