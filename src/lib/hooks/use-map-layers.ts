import type { InferSelectModel } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo } from "react";

import type { areaLayers } from "../schema/schema";

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

interface UseMapLayersProps {
  mapRef: React.RefObject<MapLibreMap | null>;
  isMapLoaded: boolean;
  layerId: string;
  data: FeatureCollection<Polygon | MultiPolygon>;
  statesData?: FeatureCollection<Polygon | MultiPolygon> | null;
  getSelectedFeatureCollection: () => FeatureCollection<Polygon | MultiPolygon>;
  getLabelPoints: (
    data: FeatureCollection<Polygon | MultiPolygon>
  ) => FeatureCollection;
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
  getSelectedFeatureCollection,
  getLabelPoints,
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
      selectedSourceId: `${layerId}-selected-source`,
      selectedLayerId: `${layerId}-selected-layer`,
      labelSourceId: `${layerId}-label-points`,
      labelLayerId: `${layerId}-label`,
      stateSourceId: "state-boundaries-source",
      stateLayerId: "state-boundaries-layer",
      stateLabelSourceId: "state-boundaries-label-points",
      stateLabelLayerId: "state-boundaries-label",
    }),
    [layerId]
  );

  // Helper to add a layer with beforeId if it exists

  // Use useLayoutEffect for layer initialization to prevent visual flicker
  // This ensures all layers are created synchronously before paint
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !data) {
      return;
    }

    // Create stable references for functions to avoid dependency issues
    const selectedFeatureCollection = (() => getSelectedFeatureCollection())();

    const labelPoints = (() => getLabelPoints(data))();

    const statesLabelPoints = statesData
      ? (() => getLabelPoints(statesData))()
      : null;

    // --- Robust source creation ---
    // Always create all sources first
    // 1. Main data source
    if (!map.getSource(ids.sourceId)) {
      map.addSource(ids.sourceId, { type: "geojson", data });
    } else {
      const src = map.getSource(ids.sourceId) as GeoJSONSource | undefined;
      if (src && typeof src.setData === "function") {
        src.setData(data);
      }
    }
    // 2. Selected source
    if (!map.getSource(ids.selectedSourceId)) {
      map.addSource(ids.selectedSourceId, {
        type: "geojson",
        data: selectedFeatureCollection,
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
      map.addSource(ids.labelSourceId, { type: "geojson", data: labelPoints });
    } else {
      const src = map.getSource(ids.labelSourceId) as GeoJSONSource | undefined;
      if (src && typeof src.setData === "function") {
        src.setData(labelPoints);
      }
    }
    // 5. State boundaries sources
    if (statesData) {
      if (!map.getSource(ids.stateSourceId)) {
        map.addSource(ids.stateSourceId, { type: "geojson", data: statesData });
      } else {
        const src = map.getSource(ids.stateSourceId) as
          | GeoJSONSource
          | undefined;
        if (src && typeof src.setData === "function") {
          src.setData(statesData);
        }
      }
      if (!map.getSource(ids.stateLabelSourceId)) {
        map.addSource(ids.stateLabelSourceId, {
          type: "geojson",
          data: statesLabelPoints!,
        });
      } else {
        const src = map.getSource(ids.stateLabelSourceId) as
          | GeoJSONSource
          | undefined;
        if (src && typeof src.setData === "function") {
          src.setData(statesLabelPoints!);
        }
      }
    }

    // --- Robust layer creation ---
    // Helper to add a layer with beforeId if it exists
    function safeAddLayer(layer: LayerSpecification, beforeId?: string) {
      if (!map) {
        return;
      }
      try {
        if (beforeId && map.getLayer(beforeId)) {
          map.addLayer(layer, beforeId);
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
      map.addLayer({
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
      } as LayerSpecification);
    }
    // 3. Selected postal code fill (above postal code border)
    // This shows a preview of what will be added to the active layer
    if (!map.getLayer(ids.selectedLayerId)) {
      // Get active layer color or default to blue
      const activeLayer = layers?.find((l) => l.id === activeLayerId);
      const fillColor = activeLayer?.color || "#2563EB";
      const fillOpacity = 0.3; // Lower opacity to show this is a preview/temporary

      safeAddLayer(
        {
          id: ids.selectedLayerId,
          type: "fill",
          source: ids.selectedSourceId,
          paint: {
            "fill-color": fillColor,
            "fill-opacity": fillOpacity,
            "fill-outline-color": fillColor,
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
      statesData &&
      map.getSource(ids.stateSourceId) &&
      !map.getLayer("state-boundaries-fill")
    ) {
      safeAddLayer(
        {
          id: "state-boundaries-fill",
          type: "fill",
          source: ids.stateSourceId,
          paint: {
            "fill-color": [
              "match",
              ["get", "name"],
              "Baden-Württemberg",
              "#e57373",
              "Bayern",
              "#64b5f6",
              "Berlin",
              "#81c784",
              "Brandenburg",
              "#ffd54f",
              "Bremen",
              "#ba68c8",
              "Hamburg",
              "#4dd0e1",
              "Hessen",
              "#ffb74d",
              "Mecklenburg-Vorpommern",
              "#a1887f",
              "Niedersachsen",
              "#90a4ae",
              "Nordrhein-Westfalen",
              "#f06292",
              "Rheinland-Pfalz",
              "#9575cd",
              "Saarland",
              "#4caf50",
              "Sachsen",
              "#fbc02d",
              "Sachsen-Anhalt",
              "#388e3c",
              "Schleswig-Holstein",
              "#0288d1",
              "Thüringen",
              "#d84315",
              "#222", // default
            ],
            "fill-opacity": 0.1,
          },
        },
        ids.hoverLayerId
      );
    }
    // 5b. State boundaries line (above all postal code layers - highest priority)
    if (
      statesData &&
      map.getSource(ids.stateSourceId) &&
      !map.getLayer(ids.stateLayerId)
    ) {
      safeAddLayer(
        {
          id: ids.stateLayerId,
          type: "line",
          source: ids.stateSourceId,
          paint: {
            "line-color": [
              "match",
              ["get", "name"],
              "Baden-Württemberg",
              "#e57373",
              "Bayern",
              "#64b5f6",
              "Berlin",
              "#81c784",
              "Brandenburg",
              "#ffd54f",
              "Bremen",
              "#ba68c8",
              "Hamburg",
              "#4dd0e1",
              "Hessen",
              "#ffb74d",
              "Mecklenburg-Vorpommern",
              "#a1887f",
              "Niedersachsen",
              "#90a4ae",
              "Nordrhein-Westfalen",
              "#f06292",
              "Rheinland-Pfalz",
              "#9575cd",
              "Saarland",
              "#4caf50",
              "Sachsen",
              "#fbc02d",
              "Sachsen-Anhalt",
              "#388e3c",
              "Schleswig-Holstein",
              "#0288d1",
              "Thüringen",
              "#d84315",
              "#222", // default
            ],
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
    if (statesData && !map.getLayer("state-boundaries-label")) {
      safeAddLayer(
        {
          id: "state-boundaries-label",
          type: "symbol",
          source: "state-boundaries-label-points",
          layout: {
            "text-field": ["coalesce", ["get", "name"], ["get", "code"], ""],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 9,
            "text-anchor": "center",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#222",
            "text-halo-color": "#fff",
            "text-halo-width": 2.5,
          },
        },
        statesData ? ids.stateLayerId : ids.hoverLayerId
      );
    }
    // 7. Postal code label (above all layers)
    if (!map.getLayer(ids.labelLayerId)) {
      safeAddLayer(
        {
          id: ids.labelLayerId,
          type: "symbol",
          source: ids.labelSourceId,
          layout: {
            "text-field": [
              "coalesce",
              ["get", "PLZ"],
              ["get", "plz"],
              ["get", "code"],
              "",
            ],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 9,
            "text-anchor": "center",
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#222",
            "text-halo-color": "#fff",
            "text-halo-width": 2,
          },
        },
        statesData
          ? "state-boundaries-label"
          : statesData
            ? ids.stateLayerId
            : ids.hoverLayerId
      );
    }
  }, [
    mapRef,
    isMapLoaded,
    data,
    statesData,
    ids,
    layerId,
    getSelectedFeatureCollection,
    getLabelPoints,
    activeLayerId,
    layers,
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
        ids.labelLayerId,
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
      ];

      sourceIds.forEach((id) => {
        try {
          if (map.getSource(id)) {
            // First carefully find & remove ANY dynamic layers still attached to this source
            const allMapLayers = map.getStyle()?.layers || [];
            allMapLayers.forEach((layer: any) => {
              if ('source' in layer && layer.source === id) {
                try {
                  if (map.getLayer(layer.id)) map.removeLayer(layer.id);
                } catch (e) {}
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
        layerIdsToKeep.add(layerFillId);
        layerIdsToKeep.add(layerBorderId);
      
        const matchFilter = [
          "match",
          ["coalesce", ["get", "code"], ["get", "plz"], ["get", "postalCode"], ""],
          postalCodes,
          true,
          false
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
              filter: matchFilter as any,
              paint: {
                "fill-color": layer.color,
                "fill-opacity": isVisible ? opacity * 0.6 : 0,
              },
              layout: {
                visibility: isVisible ? "visible" : "none",
              },
            } as any,
            ids.hoverLayerId
          );
        } else {
          // Update existing layer properties
          map.setFilter(layerFillId, matchFilter as any);
          map.setPaintProperty(layerFillId, "fill-color", layer.color);
          map.setPaintProperty(layerFillId, "fill-opacity", isVisible ? opacity * 0.6 : 0);
          map.setLayoutProperty(layerFillId, "visibility", isVisible ? "visible" : "none");
        }

        if (!map.getLayer(layerBorderId)) {
          map.addLayer(
            {
              id: layerBorderId,
              type: "line",
              source: ids.sourceId,
              filter: matchFilter as any,
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
            } as any,
            ids.hoverLayerId
          );
        } else {
          // Update existing layer properties
          map.setFilter(layerBorderId, matchFilter as any);
          map.setPaintProperty(layerBorderId, "line-color", layer.color);
          map.setPaintProperty(layerBorderId, "line-width", isActive ? 2.5 : 1.5);
          map.setPaintProperty(layerBorderId, "line-opacity", isVisible ? (isActive ? 0.9 : 0.7) : 0);
          map.setLayoutProperty(layerBorderId, "visibility", isVisible ? "visible" : "none");
        }
      }
    });

    // Cleanup phase: Remove any dynamically created layers that no longer exist in the standard set
    const allLayers = map.getStyle()?.layers || [];
    allLayers.forEach((layer: any) => {
      if (layer.id && layer.id.startsWith("area-layer-")) {
        if (!layerIdsToKeep.has(layer.id)) {
          try { map.removeLayer(layer.id); } catch (e) {}
        }
      }
    });

    // We do NOT return a cleanup function here. The previous effect cleans up the main sources which in turn cleans up the bound layers.
  }, [
    mapRef,
    isMapLoaded,
    layers,
    ids.hoverLayerId,
    ids.sourceId,
    activeLayerId,
  ]);

  // Optimized layer switching - only update visibility and active state
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersLoaded || !layers) {
      return;
    }

    layers.forEach((layer) => {
      const layerFillId = `area-layer-${layer.id}-fill`;
      const layerBorderId = `area-layer-${layer.id}-border`;

      const isVisible = layer.isVisible === "true";
      const isActive = activeLayerId === layer.id;

      // Only update visibility and active state - no expensive operations
      if (map.getLayer(layerFillId)) {
        map.setLayoutProperty(
          layerFillId,
          "visibility",
          isVisible ? "visible" : "none"
        );
      }

      if (map.getLayer(layerBorderId)) {
        map.setPaintProperty(layerBorderId, "line-width", isActive ? 2.5 : 1.5);
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
    });
  }, [mapRef, layersLoaded, activeLayerId, layers]);

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

  return { layersLoaded };
}
