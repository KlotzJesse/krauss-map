"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";

import { ensureLabelSentinel } from "@/lib/hooks/use-map-labels";

/**
 * Creates a MapboxOverlay that ensures the label sentinel layer exists
 * before deck.gl resolves layers with `beforeId`.
 *
 * deck.gl's `resolveLayers` calls `map.addLayer(proxy, beforeId)` which
 * THROWS if `beforeId` doesn't exist. By patching `_resolveLayers`,
 * we guarantee the sentinel is created before any resolution —
 * covering onAdd, setProps, and styledata paths.
 *
 * If the sentinel can't be created (style mid-transition), we skip
 * the resolution entirely — deck.gl retries on the next styledata event.
 */
function createSafeOverlay(props: MapboxOverlayProps): MapboxOverlay {
  const overlay = new MapboxOverlay({ ...props, interleaved: true });
  // @ts-expect-error — patching private method for sentinel timing safety
  const origResolveLayers = overlay._resolveLayers.bind(overlay);
  // @ts-expect-error — patching private method
  overlay._resolveLayers = (
    map: unknown,
    deck: unknown,
    prevLayers: unknown[],
    newLayers: unknown[]
  ) => {
    if (map) {
      const ready = ensureLabelSentinel(
        map as Parameters<typeof ensureLabelSentinel>[0]
      );
      if (!ready) return; // Style not ready — deck.gl retries on next styledata
    }
    origResolveLayers(map, deck, prevLayers, newLayers);
  };
  return overlay;
}

/**
 * DeckGL overlay component that integrates deck.gl layers into a react-map-gl Map
 * via MapboxOverlay + useControl in interleaved mode.
 *
 * Interleaved mode renders deck.gl layers directly into MapLibre's WebGL context,
 * preserving z-ordering with basemap layers (e.g., city labels stay on top).
 */
export function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => createSafeOverlay(props));
  try {
    overlay.setProps({ ...props, interleaved: true });
  } catch {
    // Map may have been removed during navigation
  }
  return null;
}
