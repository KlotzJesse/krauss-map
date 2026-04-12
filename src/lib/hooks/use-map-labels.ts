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
 * Sentinel layer ID used to separate deck.gl proxy layers from MapLibre label layers.
 * All deck.gl layers use `beforeId: LABEL_SENTINEL_LAYER_ID` to insert BELOW this layer,
 * and all label symbol layers are added ABOVE it.
 * This eliminates z-ordering races between deck.gl interleaved mode and MapLibre labels.
 */
export const LABEL_SENTINEL_LAYER_ID = "deck-label-divider";

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

  // Label center cache
  const labelCenterCacheRef = useRef<{
    data: FeatureCollection<Polygon | MultiPolygon> | null;
    cache: Map<string, [number, number] | null>;
  }>({ data: null, cache: new Map() });

  // Label layer creation — runs once when map loads.
  // Creates the sentinel divider layer, then all label layers ABOVE it.
  // deck.gl layers use `beforeId: LABEL_SENTINEL_LAYER_ID` to render below labels.
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

    // Create sentinel divider layer — deck.gl layers insert BEFORE this,
    // label layers are added AFTER this (above it in the stack)
    if (!map.getLayer(LABEL_SENTINEL_LAYER_ID)) {
      try {
        map.addLayer({
          id: LABEL_SENTINEL_LAYER_ID,
          type: "background",
          paint: { "background-opacity": 0 },
        });
      } catch {
        // Layer may already exist
      }
    }

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

    // Ensure the symbol layer exists
    if (!map.getLayer(ids.areaLabelLayerId)) {
      try {
        map.addLayer({
          id: ids.areaLabelLayerId,
          type: "symbol",
          source: ids.areaLabelSourceId,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["noto_sans_bold"],
            "text-size": 14,
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-max-width": 14,
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
    const labelFeatures: Feature<Point>[] = [];

    // Invalidate cache if underlying data changed
    if (labelCenterCacheRef.current.data !== data) {
      labelCenterCacheRef.current = { data, cache: new Map() };
    }
    const labelCache = labelCenterCacheRef.current.cache;

    for (const layer of layers) {
      const postalCodes = layer.postalCodes?.map((pc) => pc.postalCode) ?? [];
      if (postalCodes.length === 0 || layer.isVisible !== "true") {
        continue;
      }

      const cacheKey = `${layer.id}:${[...postalCodes].sort().join(",")}`;
      let center = labelCache.get(cacheKey);
      if (center === undefined) {
        center = getLayerLabelCenter(data, postalCodes, featureIndex) ?? null;
        labelCache.set(cacheKey, center);
      }

      if (!center) {
        continue;
      }
      labelFeatures.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: center },
        properties: {
          name: layer.name,
          color: layer.color,
          layerId: layer.id,
        },
      });
    }

    const src = map.getSource(ids.areaLabelSourceId) as
      | GeoJSONSource
      | undefined;
    if (src && typeof src.setData === "function") {
      src.setData({ type: "FeatureCollection", features: labelFeatures });
    }
  }, [mapInstance, isMapLoaded, layers, data, featureIndex, ids]);

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
        LABEL_SENTINEL_LAYER_ID,
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
