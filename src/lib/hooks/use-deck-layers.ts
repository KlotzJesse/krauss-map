import type { PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { InferSelectModel } from "drizzle-orm";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import type { areaLayers } from "@/lib/schema/schema";
import {
  EMPTY_FEATURE_COLLECTION,
  getFeatureCode,
  hexToRgba,
} from "@/lib/utils/deck-gl-utils";

import { LABEL_SENTINEL_LAYER_ID } from "./use-map-labels";

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

// Pre-computed RGBA arrays for state colors — avoids per-feature hexToRgba in accessors.
// Fill colors at 10% opacity, line colors at full opacity.
type RgbaColor = [number, number, number, number];

const STATE_FILL_COLORS: Record<string, RgbaColor> = {};
const STATE_LINE_COLORS: Record<string, RgbaColor> = {};

const STATE_HEX_COLORS: Record<string, string> = {
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

for (const [name, hex] of Object.entries(STATE_HEX_COLORS)) {
  STATE_FILL_COLORS[name] = hexToRgba(hex, 0.1);
  STATE_LINE_COLORS[name] = hexToRgba(hex, 1);
}

const DEFAULT_STATE_FILL: RgbaColor = [34, 34, 34, 25];
const DEFAULT_STATE_LINE: RgbaColor = [34, 34, 34, 255];

interface ResolvedStyle {
  fillColor: [number, number, number, number];
  lineColor: [number, number, number, number];
  lineWidth: number;
}

/**
 * Build a Map from postalCode → resolved visual style, merging all visible area layers.
 * The active layer gets stronger styling for emphasis.
 */
function buildResolvedStyleMap(
  layers: Layer[] | undefined,
  activeLayerId: number | null | undefined
): { map: Map<string, ResolvedStyle>; version: string } {
  const result = new Map<string, ResolvedStyle>();
  if (!layers) {
    return { map: result, version: "" };
  }

  const versionParts: string[] = [];

  for (const layer of layers) {
    if (layer.isVisible !== "true") {
      continue;
    }
    const postalCodes = layer.postalCodes?.map((pc) => pc.postalCode) ?? [];
    if (postalCodes.length === 0) {
      continue;
    }

    const isActive = activeLayerId === layer.id;
    const opacity = layer.opacity / 100;
    const fillColor = hexToRgba(layer.color, opacity * 0.6);
    const lineColor = hexToRgba(layer.color, isActive ? 0.9 : 0.7);
    const lineWidth = isActive ? 2.5 : 1.5;

    versionParts.push(`${layer.id}:${layer.color}:${opacity}:${isActive}`);

    for (const code of postalCodes) {
      // Last layer wins for overlap — active layer takes priority
      if (!result.has(code) || isActive) {
        result.set(code, { fillColor, lineColor, lineWidth });
      }
    }
  }

  return { map: result, version: versionParts.join("|") };
}

/**
 * Pre-filter a FeatureCollection to only features present in the resolved style map.
 * Uses featureIndex for O(k) lookup when available.
 */
function filterAreaFeatures(
  data: FeatureCollection<Polygon | MultiPolygon>,
  codeSet: Set<string>,
  featureIndex?: Map<string, Feature<Polygon | MultiPolygon>[]>
): FeatureCollection<Polygon | MultiPolygon> {
  if (codeSet.size === 0) {
    return EMPTY_FEATURE_COLLECTION as FeatureCollection<
      Polygon | MultiPolygon
    >;
  }

  const features: Feature<Polygon | MultiPolygon>[] = [];

  if (featureIndex) {
    for (const code of codeSet) {
      const fts = featureIndex.get(code);
      if (fts) {
        for (const ft of fts) {
          features.push(ft);
        }
      }
    }
  } else {
    for (const feature of data.features) {
      const code = getFeatureCode(feature);
      if (code && codeSet.has(code)) {
        features.push(feature);
      }
    }
  }

  return { type: "FeatureCollection", features };
}

interface UseDeckLayersProps {
  data: FeatureCollection<Polygon | MultiPolygon>;
  statesData?: FeatureCollection<Polygon | MultiPolygon> | null;
  layers?: Layer[];
  activeLayerId?: number | null;
  previewPostalCode?: string | null;
  featureIndex?: Map<string, Feature<Polygon | MultiPolygon>[]>;
  isCursorMode: boolean;
  mapCanvasRef: RefObject<HTMLCanvasElement | null>;
}

/**
 * Hook that returns all deck.gl layer instances for the map.
 * Only polygon/fill/interaction layers — labels stay in MapLibre (hybrid approach).
 */
export function useDeckLayers({
  data,
  statesData,
  layers,
  activeLayerId,
  previewPostalCode,
  featureIndex,
  isCursorMode,
  mapCanvasRef,
}: UseDeckLayersProps) {
  // Hover state: store the currently hovered feature for the outline layer
  const [hoveredFeature, setHoveredFeature] = useState<Feature<
    Polygon | MultiPolygon
  > | null>(null);
  const hoveredCodeRef = useRef<string | null>(null);

  // Resolve per-postal-code styles from all area layers
  const { map: resolvedStyles, version: resolvedStylesVersion } = useMemo(
    () => buildResolvedStyleMap(layers, activeLayerId),
    [layers, activeLayerId]
  );

  // Stable set of codes across all visible layers — independent of activeLayerId.
  // Switching active layer changes styling but NOT which codes are in the set,
  // so areaFeaturesData avoids unnecessary recomputation on layer switches.
  const resolvedCodeSet = useMemo(() => {
    const codes = new Set<string>();
    if (!layers) {
      return codes;
    }
    for (const layer of layers) {
      if (layer.isVisible !== "true") {
        continue;
      }
      const postalCodes = layer.postalCodes?.map((pc) => pc.postalCode) ?? [];
      for (const code of postalCodes) {
        codes.add(code);
      }
    }
    return codes;
  }, [layers]);

  // Pre-filtered area features (only features in any visible area layer)
  const areaFeaturesData = useMemo(
    () => filterAreaFeatures(data, resolvedCodeSet, featureIndex),
    [data, resolvedCodeSet, featureIndex]
  );

  // Preview feature data
  const previewData = useMemo(() => {
    if (!previewPostalCode || !featureIndex) {
      return EMPTY_FEATURE_COLLECTION as FeatureCollection<
        Polygon | MultiPolygon
      >;
    }
    const features = featureIndex.get(previewPostalCode);
    if (!features || features.length === 0) {
      return EMPTY_FEATURE_COLLECTION as FeatureCollection<
        Polygon | MultiPolygon
      >;
    }
    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [previewPostalCode, featureIndex]);

  // Hover outline data — single-feature FeatureCollection
  const hoverData = useMemo(
    () =>
      hoveredFeature
        ? ({
            type: "FeatureCollection",
            features: [hoveredFeature],
          } as FeatureCollection<Polygon | MultiPolygon>)
        : (EMPTY_FEATURE_COLLECTION as FeatureCollection<
            Polygon | MultiPolygon
          >),
    [hoveredFeature]
  );

  // Handle hover from deck.gl picking — cursor set via direct DOM mutation (no React re-render)
  const onHover = useCallback(
    (info: PickingInfo) => {
      if (!isCursorMode) {
        return;
      }

      const canvas = mapCanvasRef.current;
      if (info.object) {
        const feature = info.object as Feature<Polygon | MultiPolygon>;
        const code = getFeatureCode(feature);
        if (code && hoveredCodeRef.current !== code) {
          hoveredCodeRef.current = code;
          setHoveredFeature(feature);
          if (canvas) {
            canvas.style.cursor = "pointer";
          }
        }
      } else if (hoveredCodeRef.current !== null) {
        hoveredCodeRef.current = null;
        setHoveredFeature(null);
        if (canvas) {
          canvas.style.cursor = "grab";
        }
      }
    },
    [isCursorMode, mapCanvasRef]
  );

  // Clear hover state when leaving cursor mode (e.g., switching to drawing)
  useEffect(() => {
    if (!isCursorMode) {
      hoveredCodeRef.current = null;
      setHoveredFeature(null);
      const canvas = mapCanvasRef.current;
      if (canvas) {
        canvas.style.cursor = "grab";
      }
    }
  }, [isCursorMode, mapCanvasRef]);

  // State boundaries layer — isolated since statesData never changes after load
  const stateBoundariesLayer = useMemo(
    () =>
      statesData
        ? new GeoJsonLayer({
            id: "state-boundaries",
            data: statesData,
            beforeId: LABEL_SENTINEL_LAYER_ID,
            filled: true,
            stroked: true,
            getFillColor: (f) => {
              const name = (f as Feature<Polygon | MultiPolygon>).properties
                ?.name as string;
              return STATE_FILL_COLORS[name] ?? DEFAULT_STATE_FILL;
            },
            getLineColor: (f) => {
              const name = (f as Feature<Polygon | MultiPolygon>).properties
                ?.name as string;
              return STATE_LINE_COLORS[name] ?? DEFAULT_STATE_LINE;
            },
            getLineWidth: 2,
            lineWidthUnits: "pixels" as const,
            pickable: false,
            updateTriggers: {
              getFillColor: [],
              getLineColor: [],
            },
          })
        : null,
    [statesData]
  );

  // Build all deck.gl layers
  const deckLayers = useMemo(() => {
    const result: GeoJsonLayer[] = [];

    if (stateBoundariesLayer) {
      result.push(stateBoundariesLayer);
    }

    // Base postal code layer — THE ONLY pickable layer
    result.push(
      new GeoJsonLayer({
        id: "postal-codes",
        data,
        beforeId: LABEL_SENTINEL_LAYER_ID,
        filled: true,
        stroked: true,
        getFillColor: [98, 125, 152, 25],
        getLineColor: [37, 99, 235, 13],
        getLineWidth: 1,
        lineWidthUnits: "pixels" as const,
        lineJointRounded: true,
        lineCapRounded: true,
        pickable: isCursorMode,
        autoHighlight: isCursorMode,
        highlightColor: [37, 99, 235, 50],
      })
    );

    // Combined area overlay layer — always present to avoid MapLibre add/remove churn
    result.push(
      new GeoJsonLayer({
        id: "area-layers-combined",
        data: areaFeaturesData,
        beforeId: LABEL_SENTINEL_LAYER_ID,
        filled: true,
        stroked: true,
        getFillColor: (f) => {
          const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
          return code
            ? (resolvedStyles.get(code)?.fillColor ?? [0, 0, 0, 0])
            : [0, 0, 0, 0];
        },
        getLineColor: (f) => {
          const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
          return code
            ? (resolvedStyles.get(code)?.lineColor ?? [0, 0, 0, 0])
            : [0, 0, 0, 0];
        },
        getLineWidth: (f) => {
          const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
          return code ? (resolvedStyles.get(code)?.lineWidth ?? 1) : 1;
        },
        lineWidthUnits: "pixels" as const,
        lineJointRounded: true,
        lineCapRounded: true,
        pickable: false,
        updateTriggers: {
          getFillColor: [resolvedStylesVersion],
          getLineColor: [resolvedStylesVersion],
          getLineWidth: [resolvedStylesVersion],
        },
      })
    );

    // Preview layer — always present to avoid MapLibre add/remove churn
    result.push(
      new GeoJsonLayer({
        id: "preview-layer",
        data: previewData,
        beforeId: LABEL_SENTINEL_LAYER_ID,
        filled: true,
        stroked: true,
        getFillColor: [37, 99, 235, 80],
        getLineColor: [37, 99, 235, 200],
        getLineWidth: 2,
        lineWidthUnits: "pixels" as const,
        pickable: false,
      })
    );

    // Hover outline layer — always present to avoid MapLibre add/remove churn
    result.push(
      new GeoJsonLayer({
        id: "hover-outline",
        data: hoverData,
        beforeId: LABEL_SENTINEL_LAYER_ID,
        filled: false,
        stroked: true,
        getLineColor: [37, 99, 235, 255],
        getLineWidth: 3,
        lineWidthUnits: "pixels" as const,
        pickable: false,
      })
    );

    return result;
  }, [
    stateBoundariesLayer,
    data,
    areaFeaturesData,
    resolvedStyles,
    resolvedStylesVersion,
    previewData,
    hoverData,
    isCursorMode,
  ]);

  return {
    deckLayers,
    onHover,
  } as const;
}
