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
  FilterSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { areaLayers } from "../schema/schema";

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

// Minimum zoom level at which labels become visible, keyed by digit count (1–5)
const LABEL_MIN_ZOOM: Record<number, number> = {
  1: 3,
  2: 5,
  3: 7,
  4: 8,
  5: 9,
};

// State name → brand color mapping — defined once at module level to avoid
// recreating the 16-entry object on every render / effect run.
const STATE_COLORS: Record<string, string> = {
  "Baden-Württemberg": "#e57373",
  Bayern: "#64b5f6",
  Berlin: "#81c784",
  Brandenburg: "#ffd54f",
  Bremen: "#ba68c8",
  Hamburg: "#4dd0e1",
  Hessen: "#ffb74d",
  "Mecklenburg-Vorpommern": "#a1887f",
  Niedersachsen: "#90a4ae",
  "Nordrhein-Westfalen": "#f06292",
  "Rheinland-Pfalz": "#9575cd",
  Saarland: "#4caf50",
  Sachsen: "#fbc02d",
  "Sachsen-Anhalt": "#388e3c",
  "Schleswig-Holstein": "#0288d1",
  Thüringen: "#d84315",
};

// Build the MapLibre match expression from the STATE_COLORS map so we define it
// ONCE at module level (avoids object allocation inside effects / renders).
function buildStateColorExpression(defaultColor: string): unknown[] {
  const expr: unknown[] = ["match", ["get", "name"]];
  for (const [name, color] of Object.entries(STATE_COLORS)) {
    expr.push(name, color);
  }
  expr.push(defaultColor);
  return expr;
}

const STATE_FILL_COLOR_EXPR = buildStateColorExpression("#222");
const STATE_LINE_COLOR_EXPR = buildStateColorExpression("#222");

/**
 * Computes the best label placement for a layer's postal codes.
 *
 * Strategy:
 *  1. Take the area-weighted centerOfMass of the whole collection.
 *     For connected/compact areas this is always inside the polygons → perfect.
 *  2. If the center lands in empty space (disconnected clusters), fall back to
 *     the centroid of the single largest polygon in the set.
 */
function getLayerLabelCenter(
  data: FeatureCollection<Polygon | MultiPolygon>,
  postalCodes: string[]
): [number, number] | null {
  if (!postalCodes.length) {
    return null;
  }
  const codeSet = new Set(postalCodes);

  const matched: Feature<Polygon | MultiPolygon>[] = [];
  let largestFeature: Feature<Polygon | MultiPolygon> | null = null;
  let largestArea = -1;

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
    const a = turfArea(f);
    if (a > largestArea) {
      largestArea = a;
      largestFeature = f;
    }
  }

  if (!matched.length || !largestFeature) {
    return null;
  }

  // Area-weighted center of the entire collection.
  const collection: FeatureCollection<Polygon | MultiPolygon> = {
    type: "FeatureCollection",
    features: matched,
  };
  const collectionCenter = centerOfMass(collection);
  const centerPoint = collectionCenter.geometry;

  // Check if it actually falls inside any polygon.
  const isOnLand = matched.some((f) => booleanPointInPolygon(centerPoint, f));

  if (isOnLand) {
    return collectionCenter.geometry.coordinates as [number, number];
  }

  // Fallback: centroid of the largest polygon (always on solid ground).
  const fallback = centerOfMass(largestFeature);
  return fallback.geometry.coordinates as [number, number];
}

interface UseMapLayersProps {
  mapRef: React.RefObject<MapLibreMap | null>;
  isMapLoaded: boolean;
  layerId: string;
  data: FeatureCollection<Polygon | MultiPolygon>;
  statesData?: FeatureCollection<Polygon | MultiPolygon> | null;
  granularity?: string | null;
  previewPostalCode?: string | null;
  getSelectedFeatureCollection: () => FeatureCollection<Polygon | MultiPolygon>;
  /** Pre-computed label points for postal code data (from useMapOptimizations) */
  labelPoints: FeatureCollection;
  /** Pre-computed label points for state boundaries (from useMapOptimizations) */
  statesLabelPoints?: FeatureCollection | null;
  layers?: Layer[];
  activeLayerId?: number | null;
}

/**
 * Enterprise-grade hook for initializing and managing all map layers and sources.
 * Handles main, selected, hover, label, and state layers, and exposes a stable API for business logic.
 */
export function useMapLayers({
  mapRef,
  isMapLoaded,
  layerId,
  data,
  statesData,
  granularity,
  previewPostalCode,
  getSelectedFeatureCollection,
  labelPoints,
  statesLabelPoints,
  layers,
  activeLayerId,
}: UseMapLayersProps) {
  // Memoize layersLoaded calculation to prevent unnecessary rerenders
  const layersLoaded = useMemo(
    () => !!(isMapLoaded && data),
    [isMapLoaded, data]
  );

  // Memoize all IDs for stable references
  const ids = useMemo(
    () => ({
      sourceId: `${layerId}-source`,
      hoverSourceId: `${layerId}-hover-source`,
      hoverLayerId: `${layerId}-hover-layer`,
      previewLayerId: `${layerId}-preview-layer`,
      selectedSourceId: `${layerId}-selected-source`,
      selectedLayerId: `${layerId}-selected-layer`,
      labelSourceId: `${layerId}-label-points`,
      labelLayerId: `${layerId}-label`,
      stateSourceId: "state-boundaries-source",
      stateLayerId: "state-boundaries-layer",
      stateLabelSourceId: "state-boundaries-label-points",
      stateLabelLayerId: "state-boundaries-label",
      areaLabelSourceId: "map-area-name-labels-source",
      areaLabelLayerId: "map-area-name-labels-layer",
    }),
    [layerId]
  );

  // Cache the first base-map symbol layer ID — stable after initial map style loads
  const topSymbolLayerIdRef = useRef<string | null>(null);

  // Refs for data values that the layer-creation effect needs to read but should NOT
  // trigger a re-run when they change (data is stable post-mount; updates go through
  // the dedicated data-sync effect below).
  const dataRef = useRef(data);
  dataRef.current = data;
  const labelPointsRef = useRef(labelPoints);
  labelPointsRef.current = labelPoints;
  const statesDataRef = useRef(statesData);
  statesDataRef.current = statesData;
  const statesLabelPointsRef = useRef(statesLabelPoints);
  statesLabelPointsRef.current = statesLabelPoints;

  // Layer CREATION effect — runs exactly once when the map finishes loading.
  // It creates all MapLibre sources and layer definitions. It does NOT update
  // source data on subsequent renders; that is handled by the data-sync effect below.
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) {
      return;
    }

    const d = dataRef.current;
    const lp = labelPointsRef.current;
    const sd = statesDataRef.current;
    const slp = statesLabelPointsRef.current;

    if (!d) {
      return;
    }

    // --- Source creation (first-time only) ---
    // 1. Main data source
    if (!map.getSource(ids.sourceId)) {
      map.addSource(ids.sourceId, { type: "geojson", data: d });
    }
    // 2. Selected source (empty; filled by area-layers effect)
    if (!map.getSource(ids.selectedSourceId)) {
      map.addSource(ids.selectedSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    // 3. Hover source
    if (!map.getSource(ids.hoverSourceId)) {
      map.addSource(ids.hoverSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }
    // 4. Label points source
    if (!map.getSource(ids.labelSourceId)) {
      map.addSource(ids.labelSourceId, { type: "geojson", data: lp });
    }
    // 5. State boundaries sources
    if (sd) {
      if (!map.getSource(ids.stateSourceId)) {
        map.addSource(ids.stateSourceId, { type: "geojson", data: sd });
      }
      if (!map.getSource(ids.stateLabelSourceId) && slp) {
        map.addSource(ids.stateLabelSourceId, { type: "geojson", data: slp });
      }
    }

    // --- Robust layer creation ---
    // Cache: find first symbol layer from base map style once (stable after load)
    // Placing custom polygons behind it keeps city labels visible on top.
    if (!topSymbolLayerIdRef.current) {
      const mapLayers = map.getStyle()?.layers;
      if (mapLayers) {
        for (const mapLayer of mapLayers) {
          if (
            mapLayer.type === "symbol" &&
            !mapLayer.id.includes("state-boundaries") &&
            mapLayer.id !== ids.labelLayerId
          ) {
            topSymbolLayerIdRef.current = mapLayer.id;
            break;
          }
        }
      }
    }
    const topSymbolLayerId = topSymbolLayerIdRef.current;

    // Helper to add a layer with beforeId if it exists
    function safeAddLayer(
      layer: LayerSpecification,
      beforeId?: string,
      autoUnderLabels: boolean = true
    ) {
      if (!map) {
        return;
      }
      try {
        let targetBeforeId = beforeId;

        // Automatically push non-label custom geometries behind base map labels for better clarity
        // unless they are explicitly placed relative to another custom layer.
        if (!targetBeforeId && autoUnderLabels && layer.type !== "symbol") {
          targetBeforeId = topSymbolLayerId ?? undefined;
        }

        if (targetBeforeId && map.getLayer(targetBeforeId)) {
          map.addLayer(layer, targetBeforeId);
        } else {
          map.addLayer(layer);
        }
      } catch {
        // Layer may already exist
      }
    }

    // 1. Postal code fill (bottom)
    if (!map.getLayer(`${layerId}-layer`)) {
      safeAddLayer({
        id: `${layerId}-layer`,
        type: "fill",
        source: ids.sourceId,
        paint: {
          "fill-color": "#627D98",
          "fill-opacity": 0.1,
        },
      });
    }
    // 2. Postal code border (above fill)
    if (!map.getLayer(`${layerId}-border`)) {
      safeAddLayer({
        id: `${layerId}-border`,
        type: "line",
        source: ids.sourceId,
        paint: {
          "line-color": "#2563EB",
          "line-width": 1,
          "line-opacity": 0.05,
          "line-dasharray": [6, 3],
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
          visibility: "visible",
        },
      });
    }
    // 3. Selected postal code fill (above postal code border)
    // Created with a static default color; the active-layer effect updates it afterwards.
    if (!map.getLayer(ids.selectedLayerId)) {
      safeAddLayer(
        {
          id: ids.selectedLayerId,
          type: "fill",
          source: ids.selectedSourceId,
          paint: {
            "fill-color": "#2563EB",
            "fill-opacity": 0.3,
            "fill-outline-color": "#2563EB",
          },
        },
        `${layerId}-border`
      );
    }
    // 4. Hover line (above selected postal codes)
    if (!map.getLayer(ids.hoverLayerId)) {
      safeAddLayer(
        {
          id: ids.hoverLayerId,
          type: "line",
          source: ids.hoverSourceId,
          paint: {
            "line-color": "#2563EB",
            "line-width": 3,
          },
          layout: { visibility: "none" },
        },
        ids.selectedLayerId
      );
    }
    // 5a. State boundaries fill (subtle background color for each state)
    if (
      sd &&
      map.getSource(ids.stateSourceId) &&
      !map.getLayer("state-boundaries-fill")
    ) {
      safeAddLayer(
        {
          id: "state-boundaries-fill",
          type: "fill",
          source: ids.stateSourceId,
          paint: {
            "fill-color": STATE_FILL_COLOR_EXPR as unknown as string,
            "fill-opacity": 0.1,
          },
        },
        ids.hoverLayerId
      );
    }
    // 5b. State boundaries line (above all postal code layers - highest priority)
    if (
      sd &&
      map.getSource(ids.stateSourceId) &&
      !map.getLayer(ids.stateLayerId)
    ) {
      safeAddLayer(
        {
          id: ids.stateLayerId,
          type: "line",
          source: ids.stateSourceId,
          paint: {
            "line-color": STATE_LINE_COLOR_EXPR as unknown as string,
            "line-width": 2,
            "line-opacity": 1,
          },
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
        },
        "state-boundaries-fill"
      );
    }
    // 6. State label (above state boundaries)
    if (sd && !map.getLayer("state-boundaries-label")) {
      safeAddLayer(
        {
          id: "state-boundaries-label",
          type: "symbol",
          source: "state-boundaries-label-points",
          layout: {
            "text-field": ["coalesce", ["get", "name"], ["get", "code"], ""],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 11,
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#222",
            "text-halo-color": "#fff",
            "text-halo-width": 3,
          },
        },
        sd ? ids.stateLayerId : ids.hoverLayerId
      );
    }
    // 7. Postal code labels — one layer per digit level (1–5), zoom-gated
    const labelBeforeId = sd ? "state-boundaries-label" : ids.hoverLayerId;
    for (let level = 1; level <= 5; level++) {
      const levelLayerId = `${ids.labelLayerId}-${level}`;
      if (!map.getLayer(levelLayerId)) {
        const minZoom = LABEL_MIN_ZOOM[level] ?? 10;
        safeAddLayer(
          {
            id: levelLayerId,
            type: "symbol",
            source: ids.labelSourceId,
            minzoom: minZoom,
            filter: ["==", ["get", "_labelLevel"], level],
            layout: {
              "text-field": ["get", "_labelCode"],
              "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
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
              "text-halo-width": 2,
            },
          },
          labelBeforeId
        );
      }
    }
  }, [mapRef, isMapLoaded, ids]);

  // Data-sync effect — updates source data without blocking paint (useEffect, not useLayoutEffect).
  // Runs after the layer-creation effect and whenever the underlying data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) {
      return;
    }

    const srcMain = map.getSource(ids.sourceId) as GeoJSONSource | undefined;
    srcMain?.setData(data);

    const srcLabel = map.getSource(ids.labelSourceId) as
      | GeoJSONSource
      | undefined;
    srcLabel?.setData(labelPoints);

    if (statesData) {
      const srcState = map.getSource(ids.stateSourceId) as
        | GeoJSONSource
        | undefined;
      srcState?.setData(statesData);

      if (statesLabelPoints) {
        const srcStateLabel = map.getSource(ids.stateLabelSourceId) as
          | GeoJSONSource
          | undefined;
        srcStateLabel?.setData(statesLabelPoints);
      }
    }
  }, [
    mapRef,
    isMapLoaded,
    ids,
    data,
    labelPoints,
    statesData,
    statesLabelPoints,
  ]);

  // Update selected features source when layers change
  // Note: Selections are now managed per-layer in the database
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) {
      return;
    }
    const src = map.getSource(ids.selectedSourceId) as
      | GeoJSONSource
      | undefined;
    if (src && typeof src.setData === "function") {
      src.setData(getSelectedFeatureCollection());
    }
  }, [
    getSelectedFeatureCollection,
    mapRef,
    layersLoaded,
    ids.selectedSourceId,
  ]);

  // Cleanup on unmount or dependency change
  useEffect(
    () => () => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      // First, remove all layers (order matters: remove layers before sources)
      // Order: top to bottom (reverse of creation order)
      const layerIds = [
        ids.areaLabelLayerId,
        `${ids.labelLayerId}-5`,
        `${ids.labelLayerId}-4`,
        `${ids.labelLayerId}-3`,
        `${ids.labelLayerId}-2`,
        `${ids.labelLayerId}-1`,
        "state-boundaries-label",
        ids.stateLayerId,
        "state-boundaries-fill",
        ids.hoverLayerId,
        ids.selectedLayerId,
        `${layerId}-border`,
        `${layerId}-layer`,
      ];

      layerIds.forEach((id) => {
        try {
          if (map.getLayer(id)) {
            map.removeLayer(id);
          }
        } catch (error) {
          // Layer might not exist or already removed
          if (process.env.NODE_ENV === "development") {
            console.warn(`Failed to remove layer ${id}:`, error);
          }
        }
      });

      // Then remove all sources (after all layers are removed)
      const sourceIds = [
        ids.sourceId,
        ids.selectedSourceId,
        ids.hoverSourceId,
        ids.labelSourceId,
        ids.stateSourceId,
        ids.stateLabelSourceId,
        ids.areaLabelSourceId,
      ];

      sourceIds.forEach((id) => {
        try {
          if (map.getSource(id)) {
            // First carefully find & remove ANY dynamic layers still attached to this source
            const allMapLayers = map.getStyle()?.layers || [];
            allMapLayers.forEach((layer: LayerSpecification) => {
              if ("source" in layer && layer.source === id) {
                try {
                  if (map.getLayer(layer.id)) {
                    map.removeLayer(layer.id);
                  }
                } catch {}
              }
            });
            map.removeSource(id);
          }
        } catch (error) {
          // Source might not exist or already removed
          if (process.env.NODE_ENV === "development") {
            console.warn(`Failed to remove source ${id}:`, error);
          }
        }
      });
    },
    [mapRef, layerId, ids]
  );

  // Initialize area layers using MapLibre filters (highly optimized)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !layers) {
      return;
    }

    const layerIdsToKeep = new Set();

    layers.forEach((layer) => {
      const layerFillId = `area-layer-${layer.id}-fill`;
      const layerBorderId = `area-layer-${layer.id}-border`;

      const postalCodes = layer.postalCodes?.map((pc) => pc.postalCode) || [];

      if (postalCodes.length > 0) {
        // Critical: Only proceed if the source actually exists in MapLibre
        if (!map.getSource(ids.sourceId)) {
          return;
        }

        layerIdsToKeep.add(layerFillId);
        layerIdsToKeep.add(layerBorderId);

        const matchFilter = [
          "match",
          [
            "coalesce",
            ["get", "code"],
            ["get", "plz"],
            ["get", "postalCode"],
            "",
          ],
          postalCodes,
          true,
          false,
        ];

        const opacity = layer.opacity / 100;
        const isVisible = layer.isVisible === "true";
        const isActive = activeLayerId === layer.id;

        if (!map.getLayer(layerFillId)) {
          map.addLayer(
            {
              id: layerFillId,
              type: "fill",
              source: ids.sourceId,
              filter: matchFilter as FilterSpecification,
              paint: {
                "fill-color": layer.color,
                "fill-opacity": isVisible ? opacity * 0.6 : 0,
              },
              layout: {
                visibility: isVisible ? "visible" : "none",
              },
            } as LayerSpecification,
            ids.hoverLayerId
          );
        } else {
          // Update existing layer properties
          map.setFilter(layerFillId, matchFilter as FilterSpecification);
          map.setPaintProperty(layerFillId, "fill-color", layer.color);
          map.setPaintProperty(
            layerFillId,
            "fill-opacity",
            isVisible ? opacity * 0.6 : 0
          );
          map.setLayoutProperty(
            layerFillId,
            "visibility",
            isVisible ? "visible" : "none"
          );
        }

        if (!map.getLayer(layerBorderId)) {
          map.addLayer(
            {
              id: layerBorderId,
              type: "line",
              source: ids.sourceId,
              filter: matchFilter as FilterSpecification,
              paint: {
                "line-color": layer.color,
                "line-width": isActive ? 2.5 : 1.5,
                "line-opacity": isVisible ? (isActive ? 0.9 : 0.7) : 0,
              },
              layout: {
                "line-cap": "round",
                "line-join": "round",
                visibility: isVisible ? "visible" : "none",
              },
            } as LayerSpecification,
            ids.hoverLayerId
          );
        } else {
          // Update existing layer properties
          map.setFilter(layerBorderId, matchFilter as FilterSpecification);
          map.setPaintProperty(layerBorderId, "line-color", layer.color);
          map.setPaintProperty(
            layerBorderId,
            "line-width",
            isActive ? 2.5 : 1.5
          );
          map.setPaintProperty(
            layerBorderId,
            "line-opacity",
            isVisible ? (isActive ? 0.9 : 0.7) : 0
          );
          map.setLayoutProperty(
            layerBorderId,
            "visibility",
            isVisible ? "visible" : "none"
          );
        }
      }
    });

    // Cleanup phase: Remove any dynamically created layers that no longer exist in the standard set
    const allLayers = map.getStyle()?.layers || [];
    allLayers.forEach((layer: LayerSpecification) => {
      if (
        layer.id &&
        layer.id.startsWith("area-layer-") &&
        !layerIdsToKeep.has(layer.id)
      ) {
        try {
          map.removeLayer(layer.id);
        } catch {}
      }
    });

    // We do NOT return a cleanup function here. The previous effect cleans up the main sources which in turn cleans up the bound layers.
  }, [
    mapRef,
    isMapLoaded,
    layers,
    ids.hoverLayerId,
    activeLayerId,
    ids.sourceId,
  ]);

  // Dedicated effect: create the area-label source+layer and keep its data in sync
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !layers) {
      return;
    }

    // Ensure the GeoJSON source exists before touching any layer
    if (!map.getSource(ids.areaLabelSourceId)) {
      map.addSource(ids.areaLabelSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }

    // Ensure the symbol layer exists (added at the very top of the stack)
    if (!map.getLayer(ids.areaLabelLayerId)) {
      try {
        map.addLayer({
          id: ids.areaLabelLayerId,
          type: "symbol",
          source: ids.areaLabelSourceId,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 14,
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            "text-max-width": 14,
          },
          paint: {
            "text-color": ["coalesce", ["get", "color"], "#1a1a1a"],
            "text-halo-color": "rgba(255,255,255,0.9)",
            "text-halo-width": 2,
          },
        } as LayerSpecification);
      } catch {
        // Layer may already exist from a concurrent render
      }
    }

    // Compute one label point per visible layer
    const labelFeatures: Feature<Point>[] = [];
    for (const layer of layers) {
      const postalCodes = layer.postalCodes?.map((pc) => pc.postalCode) ?? [];
      if (postalCodes.length === 0 || layer.isVisible !== "true") {
        continue;
      }
      const center = getLayerLabelCenter(data, postalCodes);
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
  }, [
    mapRef,
    isMapLoaded,
    layers,
    data,
    ids.areaLabelSourceId,
    ids.areaLabelLayerId,
  ]);

  // Update selected regions color when active layer changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) {
      return;
    }

    const activeLayer = layers?.find((l) => l.id === activeLayerId);
    const fillColor = activeLayer?.color || "#2563EB";
    const fillOpacity = 0.3; // Lower opacity for preview

    if (map.getLayer(ids.selectedLayerId)) {
      map.setPaintProperty(ids.selectedLayerId, "fill-color", fillColor);
      map.setPaintProperty(ids.selectedLayerId, "fill-opacity", fillOpacity);
      map.setPaintProperty(
        ids.selectedLayerId,
        "fill-outline-color",
        fillColor
      );
    }
  }, [mapRef, layersLoaded, layers, activeLayerId, ids.selectedLayerId]);

  // Handle preview feature filtering
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded) {
      return;
    }

    if (map.getLayer(ids.previewLayerId)) {
      if (previewPostalCode) {
        map.setFilter(ids.previewLayerId, [
          "any",
          ["==", ["get", "code"], previewPostalCode],
          ["==", ["get", "PLZ"], previewPostalCode],
          ["==", ["get", "plz"], previewPostalCode],
        ]);
        map.setLayoutProperty(ids.previewLayerId, "visibility", "visible");
      } else {
        map.setLayoutProperty(ids.previewLayerId, "visibility", "none");
      }
    }
  }, [mapRef, layersLoaded, previewPostalCode, ids.previewLayerId]);

  return { layersLoaded };
}
