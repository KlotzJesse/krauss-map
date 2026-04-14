"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";

/**
 * DeckGL overlay component that integrates deck.gl layers into a react-map-gl Map
 * via MapboxOverlay + useControl in interleaved mode.
 *
 * Interleaved mode renders deck.gl layers directly into MapLibre's WebGL context,
 * preserving z-ordering with basemap layers.
 *
 * Layer ordering is controlled via `beforeId` on individual deck.gl layers,
 * which reference the first basemap symbol layer (e.g., "poi-amenity") —
 * a layer that's part of the style definition and survives all style transitions.
 */
export function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ ...props, interleaved: true })
  );
  // Guard against stale overlay after map is destroyed (navigation/HMR).
  // overlay._map is set to undefined in onRemove; setProps would crash
  // accessing the dead map's getProjection().
  // @ts-expect-error — accessing private _map to check liveness
  if (overlay._map) {
    overlay.setProps({ ...props, interleaved: true });
  }
  return null;
}
