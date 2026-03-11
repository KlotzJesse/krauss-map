import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useRef } from "react";
import { flushSync } from "react-dom";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { isFeatureWithCode } from "@/lib/utils/map-feature-utils";

/**
 * Hook for managing hover state and interactions
 * Optimized for performance with ref-based state tracking
 */
export function useMapHoverInteraction(
  map: MapLibreMap | null,
  layerId: string,
  layersLoaded: boolean,
  isCursorMode: boolean
) {
  // Use ref to avoid re-renders when hover state changes
  const hoveredRegionIdRef = useRef<string | null>(null);

  // Core hover processing logic
  const processHover = useStableCallback((...args: unknown[]) => {
    if (!map || !layersLoaded || !isCursorMode) {
      return;
    }

    const hoverSourceId = `${layerId}-hover-source`;
    const hoverLayerId = `${layerId}-hover-layer`;
    const e = args[0] as { features?: unknown[] };

    if (e && Array.isArray(e.features) && e.features.length > 0) {
      const feature = e.features[0];
      if (isFeatureWithCode(feature)) {
        // TypeScript narrowing workaround - explicit type assertion after type guard
        const typedFeature = feature as { properties?: { code?: string } };
        const regionCode = typedFeature.properties?.code;
        if (regionCode && hoveredRegionIdRef.current !== regionCode) {
          const src = map.getSource(hoverSourceId);
          if (src && "setData" in src) {
            const geoSrc = src as GeoJSONSource;
            // Strip MapLibre's internal classes from the feature before passing to setData
            const cleanFeature = {
              type: "Feature" as const,
              geometry: (feature as { geometry: unknown }).geometry,
              properties: typedFeature.properties,
            };
            geoSrc.setData({
              type: "FeatureCollection",
              features: [
                cleanFeature as Parameters<typeof geoSrc.setData>[0] extends {
                  features: (infer F)[];
                }
                  ? F
                  : never,
              ],
            });
          }
          map.setLayoutProperty(hoverLayerId, "visibility", "visible");

          // Use flushSync for synchronous cursor updates to prevent visual lag
          flushSync(() => {
            const canvas = map.getCanvas();
            if (canvas) {
              canvas.style.cursor = "pointer";
            }
          });
          hoveredRegionIdRef.current = regionCode;
        }
      }
    }
  });

  // Mouse enter handler
  const handleMouseEnter = useStableCallback((...args: unknown[]) => {
    processHover(...args);
  });

  // Mouse move handler
  const handleMouseMove = useStableCallback((...args: unknown[]) => {
    processHover(...args);
  });

  // Mouse leave handler
  const handleMouseLeave = useStableCallback(() => {
    if (!map || !layersLoaded || !isCursorMode) {
      return;
    }

    const hoverSourceId = `${layerId}-hover-source`;
    const hoverLayerId = `${layerId}-hover-layer`;
    const src = map.getSource(hoverSourceId);

    if (src && "setData" in src && typeof src.setData === "function") {
      src.setData({
        type: "FeatureCollection",
        features: [],
      });
    }

    if (map) {
      map.setLayoutProperty(hoverLayerId, "visibility", "none");
      // Use flushSync for synchronous cursor updates to prevent visual lag
      flushSync(() => {
        const canvas = map.getCanvas();
        if (canvas) {
          canvas.style.cursor = "grab";
        }
      });
    }

    hoveredRegionIdRef.current = null;
  });

  return {
    hoveredRegionIdRef,
    handleMouseEnter,
    handleMouseMove,
    handleMouseLeave,
  } as const;
}
