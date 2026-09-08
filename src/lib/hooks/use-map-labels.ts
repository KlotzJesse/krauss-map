import type { Feature, FeatureCollection, Point } from "geojson";
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { PostalCodeIndex } from "@/lib/hooks/use-postal-code-index";
import type { Layer } from "@/lib/types/area-types";
import { resolveFeatureKey } from "@/lib/utils/deck-gl-utils";

/**
 * Returns the ID of the first label/symbol layer AFTER basemap boundary lines.
 * Used as `beforeId` for deck.gl layers to ensure proper z-ordering:
 * our polygon/line layers render above basemap boundary lines but below labels.
 */
export function getFirstSymbolLayerId(map: MapLibreMap): string | undefined {
  const style = map.getStyle();
  if (!style?.layers) return undefined;
  // Find the last boundary line layer, then return the next layer's ID
  let lastBoundaryIdx = -1;
  for (let i = 0; i < style.layers.length; i++) {
    const layer = style.layers[i];
    if (layer.id.startsWith("boundary-") && layer.type === "line") {
      lastBoundaryIdx = i;
    }
  }
  // If boundary lines found, insert after them
  if (lastBoundaryIdx >= 0 && lastBoundaryIdx + 1 < style.layers.length) {
    return style.layers[lastBoundaryIdx + 1].id;
  }
  // Fallback: first symbol layer
  for (const layer of style.layers) {
    if (layer.type === "symbol") return layer.id;
  }
  return undefined;
}

// Minimum zoom level at which labels become visible, keyed by digit count (1–5)
const LABEL_MIN_ZOOM: Record<number, number> = {
  1: 3,
  2: 5,
  3: 7,
  4: 8,
  5: 9,
};

function hashPostalCodes(codes: string[]): string {
  let sumHash = 0;
  let xorHash = 0;
  for (const code of codes) {
    let codeHash = 0;
    for (let i = 0; i < code.length; i++) {
      codeHash = ((codeHash * 31) + code.charCodeAt(i)) >>> 0;
    }
    sumHash = (sumHash + codeHash) >>> 0;
    xorHash = (xorHash ^ ((codeHash << 1) | (codeHash >>> 31))) >>> 0;
  }
  return `${sumHash.toString(36)}:${xorHash.toString(36)}`;
}

/**
 * Best label placement for a layer's postal codes.
 *
 * Area-weighted mean of the member codes' representative points, then snapped
 * to the member point nearest that mean. Snapping is what keeps the label on
 * the layer: a weighted mean of a horseshoe- or island-shaped layer lands
 * outside it, which is why this used to compute a centre of mass and then test
 * it against every member polygon. Representative points come from
 * ST_PointOnSurface, so the snapped result is always inside a member — a
 * stronger guarantee than the old on-land test, without any geometry.
 */
function getLayerLabelCenterFromIndex(
  index: PostalCodeIndex,
  postalCodes: string[]
): [number, number] | null {
  let sumLng = 0;
  let sumLat = 0;
  let sumWeight = 0;

  for (const code of postalCodes) {
    const i = index.pos.get(code);
    if (i === undefined) {
      continue;
    }
    // Codes with a rounded area of zero would drop out of the weighting.
    const weight = index.area[i] || 0.1;
    sumLng += index.cen[i * 2] * weight;
    sumLat += index.cen[i * 2 + 1] * weight;
    sumWeight += weight;
  }

  if (sumWeight === 0) {
    return null;
  }

  const meanLng = sumLng / sumWeight;
  const meanLat = sumLat / sumWeight;

  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (const code of postalCodes) {
    const i = index.pos.get(code);
    if (i === undefined) {
      continue;
    }
    const lng = index.cen[i * 2];
    const lat = index.cen[i * 2 + 1];
    const distance = (lng - meanLng) ** 2 + (lat - meanLat) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [lng, lat];
    }
  }

  return best;
}

interface UseMapLabelsProps {
  mapInstance: MapLibreMap | null;
  isMapLoaded: boolean;
  layerId: string;
  index: PostalCodeIndex;
  labelPoints: FeatureCollection;
  statesLabelPoints?: FeatureCollection | null;
  layers?: Layer[];
  /** Country code for the area — used to prefix raw postal codes for index lookup. */
  country?: string;
}

/**
 * Hook for managing MapLibre native symbol layers (labels).
 * This is the hybrid escape hatch — labels stay in MapLibre for superior SDF text rendering.
 * All polygon/fill/interaction layers are managed by deck.gl via useDeckLayers.
 */
export function useMapLabels({
  mapInstance,
  isMapLoaded,
  layerId,
  index,
  labelPoints,
  statesLabelPoints,
  layers,
  country,
}: UseMapLabelsProps) {
  // Memoize IDs for stable references
  const ids = useMemo(
    () => ({
      labelSourceId: `${layerId}-label-points`,
      labelLayerId: `${layerId}-label`,
      stateLabelSourceId: "state-boundaries-label-points",
      stateLabelLayerId: "state-boundaries-label",
      areaLabelSourceId: "map-area-name-labels-source",
      areaLabelLayerId: "map-area-name-labels-layer",
    }),
    [layerId]
  );

  // Refs for data values that creation effect reads but shouldn't trigger re-runs
  const labelPointsRef = useRef(labelPoints);
  labelPointsRef.current = labelPoints;
  const statesLabelPointsRef = useRef(statesLabelPoints);
  statesLabelPointsRef.current = statesLabelPoints;

  // Label center cache — invalidated only when postal code MEMBERSHIP changes.
  // Color/opacity/name changes do NOT affect label positions, so using layers
  // identity (which changes on any property update) was too aggressive.
  const labelCenterCacheRef = useRef<{
    fingerprint: string;
    cache: Map<number, [number, number] | null>;
  }>({ fingerprint: "", cache: new Map() });

  // Label layer creation — runs once when map loads.
  // Label layers are added at the top of the style stack (above basemap symbols
  // and deck.gl layers) to ensure they're always visible.
  useLayoutEffect(() => {
    if (!mapInstance || !isMapLoaded) {
      return;
    }

    const map = mapInstance;
    // Guard: map may have been removed (style destroyed)
    if (!map.getStyle()) {
      return;
    }
    const lp = labelPointsRef.current;
    const slp = statesLabelPointsRef.current;

    // Create label points source
    if (!map.getSource(ids.labelSourceId)) {
      map.addSource(ids.labelSourceId, { type: "geojson", data: lp });
    }

    // Create state label points source
    if (slp && !map.getSource(ids.stateLabelSourceId)) {
      map.addSource(ids.stateLabelSourceId, { type: "geojson", data: slp });
    }

    // State label layer
    if (slp && !map.getLayer(ids.stateLabelLayerId)) {
      try {
        map.addLayer({
          id: ids.stateLabelLayerId,
          type: "symbol",
          source: ids.stateLabelSourceId,
          layout: {
            "text-field": ["coalesce", ["get", "name"], ["get", "code"], ""],
            "text-font": ["noto_sans_bold"],
            "text-size": 11,
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#222",
            "text-halo-color": "#fff",
            "text-halo-width": 3,
            "text-halo-blur": 0,
          },
        });
      } catch {
        // Layer may already exist
      }
    }

    // Postal code labels — one layer per digit level (1–5), zoom-gated
    for (let level = 1; level <= 5; level++) {
      const levelLayerId = `${ids.labelLayerId}-${level}`;
      if (!map.getLayer(levelLayerId)) {
        const minZoom = LABEL_MIN_ZOOM[level] ?? 10;
        try {
          map.addLayer({
            id: levelLayerId,
            type: "symbol",
            source: ids.labelSourceId,
            minzoom: minZoom,
            filter: ["==", ["get", "_labelLevel"], level],
            layout: {
              "text-field": ["get", "_labelCode"],
              "text-font": ["noto_sans_bold"],
              "text-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                minZoom,
                8,
                minZoom + 4,
                12,
              ],
              "text-anchor": "center",
            },
            paint: {
              "text-color": "#222",
              "text-halo-color": "#ffffff",
              "text-halo-width": 3,
              "text-halo-blur": 0,
            },
          });
        } catch {
          // Layer may already exist
        }
      }
    }
  }, [mapInstance, isMapLoaded, ids]);

  // Data-sync effect — updates label source data
  useEffect(() => {
    if (!mapInstance || !isMapLoaded || !mapInstance.getStyle()) {
      return;
    }

    const srcLabel = mapInstance.getSource(ids.labelSourceId) as
      | GeoJSONSource
      | undefined;
    srcLabel?.setData(labelPoints);

    if (statesLabelPoints) {
      const srcStateLabel = mapInstance.getSource(ids.stateLabelSourceId) as
        | GeoJSONSource
        | undefined;
      srcStateLabel?.setData(statesLabelPoints);
    }
  }, [mapInstance, isMapLoaded, ids, labelPoints, statesLabelPoints]);

  // Area name labels effect
  useEffect(() => {
    if (!mapInstance || !isMapLoaded || !layers) {
      return;
    }

    const map = mapInstance;
    if (!map.getStyle()) {
      return;
    }

    // Ensure the GeoJSON source exists
    if (!map.getSource(ids.areaLabelSourceId)) {
      map.addSource(ids.areaLabelSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }

    // Ensure the symbol layer exists — uses variable-anchor for collision avoidance
    if (!map.getLayer(ids.areaLabelLayerId)) {
      try {
        map.addLayer({
          id: ids.areaLabelLayerId,
          type: "symbol",
          source: ids.areaLabelSourceId,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["noto_sans_bold"],
            "text-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              4,
              11,
              7,
              14,
              10,
              16,
            ],
            // Let MapLibre pick the best anchor to avoid overlap
            "text-variable-anchor": [
              "center",
              "top",
              "bottom",
              "left",
              "right",
              "top-left",
              "top-right",
              "bottom-left",
              "bottom-right",
            ],
            "text-radial-offset": 0.8,
            "text-justify": "auto",
            "text-allow-overlap": false,
            "text-ignore-placement": false,
            "text-max-width": 14,
            "text-padding": 8,
            "symbol-sort-key": ["get", "sortKey"],
          },
          paint: {
            "text-color": ["coalesce", ["get", "color"], "#1a1a1a"],
            "text-halo-color": "rgba(255,255,255,0.95)",
            "text-halo-width": 3,
            "text-halo-blur": 0,
          },
        } as LayerSpecification);
      } catch {
        // Layer may already exist
      }
    }

    // Compute one label point per visible layer
    const rawLabelFeatures: {
      center: [number, number];
      name: string;
      color: string;
      layerId: number;
      codeCount: number;
    }[] = [];

    // Build a fingerprint from layer IDs + postal code membership hash.
    // This changes when membership changes, even if total counts stay identical.
    let fingerprint = "";
    for (const layer of layers) {
      const codes = layer.postalCodes?.map((pc) => pc.postalCode) ?? [];
      fingerprint += `${layer.id}:${codes.length}:${hashPostalCodes(codes)};`;
    }

    const cacheState = labelCenterCacheRef.current;
    if (cacheState.fingerprint !== fingerprint) {
      labelCenterCacheRef.current = { fingerprint, cache: new Map() };
    }
    const labelCache = labelCenterCacheRef.current.cache;

    for (const layer of layers) {
      const rawPostalCodes =
        layer.postalCodes?.map((pc) => pc.postalCode) ?? [];
      // Resolve each raw code to its correct composite index key
      const postalCodes = rawPostalCodes.map((c) =>
        resolveFeatureKey(c, country, index.pos)
      );
      if (postalCodes.length === 0 || layer.isVisible !== "true") {
        continue;
      }

      let center = labelCache.get(layer.id);
      if (center === undefined) {
        center = getLayerLabelCenterFromIndex(index, postalCodes) ?? null;
        labelCache.set(layer.id, center);
      }

      if (!center) {
        continue;
      }
      rawLabelFeatures.push({
        center,
        name: layer.name,
        color: layer.color,
        layerId: layer.id,
        codeCount: postalCodes.length,
      });
    }

    // Apply radial offsets when labels would collide (centers within threshold)
    const COLLISION_THRESHOLD_DEG = 0.15; // ~15km at mid-latitudes
    const OFFSET_DEG = 0.12;
    const labelFeatures: Feature<Point>[] = [];

    for (let i = 0; i < rawLabelFeatures.length; i++) {
      const item = rawLabelFeatures[i];
      let [lng, lat] = item.center;

      // Find all labels within collision threshold
      const neighbors: number[] = [];
      for (let j = 0; j < rawLabelFeatures.length; j++) {
        if (i === j) continue;
        const other = rawLabelFeatures[j];
        const dx = lng - other.center[0];
        const dy = lat - other.center[1];
        if (Math.sqrt(dx * dx + dy * dy) < COLLISION_THRESHOLD_DEG) {
          neighbors.push(j);
        }
      }

      if (neighbors.length > 0) {
        // Distribute labels radially around the shared center
        const allIndices = [i, ...neighbors].sort((a, b) => a - b);
        const rank = allIndices.indexOf(i);
        const total = allIndices.length;
        const angle = (rank / total) * 2 * Math.PI - Math.PI / 2;
        lng += Math.cos(angle) * OFFSET_DEG;
        lat += Math.sin(angle) * OFFSET_DEG;
      }

      labelFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {
          name: item.name,
          color: item.color,
          layerId: item.layerId,
          // Larger layers get higher priority (lower sort key = rendered first)
          sortKey: -item.codeCount,
        },
      });
    }

    const src = map.getSource(ids.areaLabelSourceId) as
      | GeoJSONSource
      | undefined;
    if (src && typeof src.setData === "function") {
      src.setData({ type: "FeatureCollection", features: labelFeatures });
    }
  }, [mapInstance, isMapLoaded, layers, index, ids, country]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (!mapInstance) {
        return;
      }
      const map = mapInstance;

      // Guard: react-map-gl may call map.remove() before our cleanup runs
      if (!map.getStyle()) {
        return;
      }

      const layerIds = [
        ids.areaLabelLayerId,
        `${ids.labelLayerId}-5`,
        `${ids.labelLayerId}-4`,
        `${ids.labelLayerId}-3`,
        `${ids.labelLayerId}-2`,
        `${ids.labelLayerId}-1`,
        ids.stateLabelLayerId,
      ];

      for (const id of layerIds) {
        try {
          if (map.getLayer(id)) {
            map.removeLayer(id);
          }
        } catch {
          // Layer might not exist
        }
      }

      const sourceIds = [
        ids.labelSourceId,
        ids.stateLabelSourceId,
        ids.areaLabelSourceId,
      ];

      for (const id of sourceIds) {
        try {
          if (map.getSource(id)) {
            // Remove any remaining dynamic layers bound to this source
            const allMapLayers = map.getStyle()?.layers || [];
            for (const layer of allMapLayers) {
              if ("source" in layer && layer.source === id) {
                try {
                  if (map.getLayer(layer.id)) {
                    map.removeLayer(layer.id);
                  }
                } catch {
                  // ignore
                }
              }
            }
            map.removeSource(id);
          }
        } catch {
          // Source might not exist
        }
      }
    },
    [mapInstance, ids]
  );
}
