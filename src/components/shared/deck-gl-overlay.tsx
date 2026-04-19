"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import type { MapboxOverlayProps } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";
import type { MutableRefObject } from "react";

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
 *
 * `overlayRef` — optional ref that receives the `MapboxOverlay` instance.
 * Use it to call `overlay.setProps({ layers })` directly from event handlers
 * (e.g., hover callbacks) without triggering React re-renders.
 */
export function DeckGLOverlay(
  props: MapboxOverlayProps & {
    overlayRef?: MutableRefObject<MapboxOverlay | null>;
  }
) {
  const { overlayRef, ...overlayProps } = props;
  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ ...overlayProps, interleaved: true })
  );
  // Guard: _map must exist AND have a loaded style — a destroyed map object is
  // still truthy after map.remove(), but getStyle() returns null/undefined.
  // Calling setProps on a dead map throws "Cannot read properties of undefined
  // (reading 'getProjection')" which is noisy even if the error boundary catches it.
  // @ts-expect-error — accessing private _map to check liveness
  if (overlay._map?.getStyle()) {
    overlay.setProps({ ...overlayProps, interleaved: true });
  }
  if (overlayRef) {
    overlayRef.current = overlay;
  }
  return null;
}

