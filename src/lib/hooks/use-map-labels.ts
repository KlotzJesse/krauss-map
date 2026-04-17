import turfArea from "@turf/area";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import centerOfMass from "@turf/center-of-mass";
import type { InferSelectModel } from "drizzle-orm";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { areaLayers } from "@/lib/schema/schema";

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

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

// Module-level WeakMap cache for turfArea results
const _turfAreaCache = new WeakMap<Feature, number>();

function _turfAreaCached(f: Feature): number {
  let a = _turfAreaCache.get(f);
  if (a === undefined) {
    a = turfArea(f);
    _turfAreaCache.set(f, a);
  }
  return a;
}

// Minimum zoom level at which labels become visible, keyed by digit count (1–5)
const LABEL_MIN_ZOOM: Record<number, number> = {
  1: 3,
  2: 5,
  3: 7,
  4: 8,
  5: 9,
};

/**
 * Computes the best label placement for a layer's postal codes.
 * Area-weighted centerOfMass, falling back to the largest polygon centroid.
 */
function getLayerLabelCenter(
  data: FeatureCollection<Polygon | MultiPolygon>,
  postalCodes: string[],
  featureIndex?: Map<string, Feature<Polygon | MultiPolygon>[]>
): [number, number] | null {
  if (!postalCodes.length) {
    return null;
  }

  const matched: Feature<Polygon | MultiPolygon>[] = [];
  let largestFeature: Feature<Polygon | MultiPolygon> | null = null;
  let largestArea = -1;

  if (featureIndex) {
    for (const code of postalCodes) {
      const features = featureIndex.get(code);
      if (!features) {
        continue;
      }
      for (const f of features) {
        matched.push(f);
        const a = _turfAreaCached(f);
        if (a > largestArea) {
          largestArea = a;
          largestFeature = f;
        }
      }
    }
  } else {
    const codeSet = new Set(postalCodes);
    for (const feature of data.features) {
      if (!feature.geometry) {
        continue;
      }
      const props = feature.properties ?? {};
      const code = props.code ?? props.plz ?? props.PLZ ?? props.postalCode;
      if (!code || !codeSet.has(String(code))) {
        continue;
      }
      const f = feature as Feature<Polygon | MultiPolygon>;
      matched.push(f);
      const a = _turfAreaCached(f);
      if (a > largestArea) {
        largestArea = a;
        largestFeature = f;
      }
    }
  }

  if (!matched.length || !largestFeature) {
    return null;
  }

  const collection: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: matched,
  };
  const collectionCenter = centerOfMass(collection);
  const centerPoint = collectionCenter.geometry;

  const isOnLand = matched.some((f) => booleanPointInPolygon(centerPoint, f));

  if (isOnLand) {
    return collectionCenter.geometry.coordinates as [number, number];
  }

  const fallback = centerOfMass(largestFeature);
  return fallback.geometry.coordinates as [number, number];
}

interface UseMapLabelsProps {
  mapInstance: MapLibreMap | null;
  isMapLoaded: boolean;
  layerId: string;
  data: FeatureCollection<Polygon | MultiPolygon>;
  labelPoints: FeatureCollection;
  statesLabelPoints?: FeatureCollection | null;
  layers?: Layer[];
  featureIndex?: Map<string, Feature<Polygon | MultiPolygon>[]>;
  /** Country code for the area — used to prefix raw postal codes for featureIndex lookup. */
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
  data,
  labelPoints,
  statesLabelPoints,
  layers,
  featureIndex,
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

    // Build a fingerprint from layer IDs + postal code counts.
    // This only changes when postal code membership changes, NOT on color/opacity tweaks.
    let fingerprint = "";
    for (const layer of layers) {
      const count = layer.postalCodes?.length ?? 0;
      fingerprint += `${layer.id}:${count};`;
    }

    const cacheState = labelCenterCacheRef.current;
    if (cacheState.fingerprint !== fingerprint) {
      labelCenterCacheRef.current = { fingerprint, cache: new Map() };
    }
    const labelCache = labelCenterCacheRef.current.cache;

    for (const layer of layers) {
      const rawPostalCodes =
        layer.postalCodes?.map((pc) => pc.postalCode) ?? [];
      // Prefix raw codes with country for composite featureIndex lookup
      const postalCodes = country
        ? rawPostalCodes.map((c) => `${country}:${c}`)
        : rawPostalCodes;
      if (postalCodes.length === 0 || layer.isVisible !== "true") {
        continue;
      }

      let center = labelCache.get(layer.id);
      if (center === undefined) {
        center = getLayerLabelCenter(data, postalCodes, featureIndex) ?? null;
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
  }, [mapInstance, isMapLoaded, layers, data, featureIndex, ids, country]);

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
