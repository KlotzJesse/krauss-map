"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";

/**
 * DeckGL overlay component that integrates deck.gl layers into a react-map-gl Map
 * via MapboxOverlay + useControl in interleaved mode.
 *
 * Interleaved mode renders deck.gl layers directly into MapLibre's WebGL context,
 * preserving z-ordering with basemap layers (e.g., city labels stay on top).
 */
export function DeckGLOverlay(
  props: MapboxOverlayProps & {
    /** Called when cursor changes due to hover. */
    onCursorChange?: (cursor: string) => void;
  }
) {
  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ ...props, interleaved: true })
  );
  try {
    overlay.setProps({ ...props, interleaved: true });
  } catch {
    // Map may have been removed during navigation
  }
  return null;
}
