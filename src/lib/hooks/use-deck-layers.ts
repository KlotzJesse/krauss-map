import type { PickingInfo } from "@deck.gl/core";
import { FillStyleExtension } from "@deck.gl/extensions";
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
import {
  createStripePatternAtlas,
  hexColorsAreSimilar,
} from "@/lib/utils/stripe-pattern";

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

// Pre-computed RGBA arrays for state colors — avoids per-feature hexToRgba in accessors.
// Fill colors at 10% opacity, line colors at full opacity.
type RgbaColor = [number, number, number, number];

const STATE_FILL_COLORS: Record<string, RgbaColor> = {};
const STATE_LINE_COLORS: Record<string, RgbaColor> = {};

const STATE_HEX_COLORS: Record<string, string> = {
  // Germany (16 Bundesländer)
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
  // Austria (9 Bundesländer)
  Burgenland: "#ef5350",
  Kärnten: "#42a5f5",
  Niederösterreich: "#66bb6a",
  Oberösterreich: "#ffa726",
  Salzburg: "#ab47bc",
  Steiermark: "#26c6da",
  Tirol: "#ec407a",
  Vorarlberg: "#8d6e63",
  Wien: "#78909c",
  // Switzerland (26 Kantone)
  Zürich: "#e53935",
  Bern: "#1e88e5",
  Luzern: "#43a047",
  Uri: "#fb8c00",
  Schwyz: "#8e24aa",
  Obwalden: "#00acc1",
  Nidwalden: "#d81b60",
  Glarus: "#6d4c41",
  Zug: "#546e7a",
  Fribourg: "#c62828",
  Solothurn: "#1565c0",
  "Basel-Stadt": "#2e7d32",
  "Basel-Landschaft": "#ef6c00",
  Schaffhausen: "#6a1b9a",
  "Appenzell Ausserrhoden": "#00838f",
  "Appenzell Innerrhoden": "#ad1457",
  "St. Gallen": "#4e342e",
  Graubünden: "#37474f",
  Aargau: "#ff7043",
  Thurgau: "#5c6bc0",
  Ticino: "#7cb342",
  Vaud: "#fdd835",
  Valais: "#ce93d8",
  Neuchâtel: "#4db6ac",
  Genève: "#ff8a65",
  Jura: "#9fa8da",
};

for (const [name, hex] of Object.entries(STATE_HEX_COLORS)) {
  STATE_FILL_COLORS[name] = hexToRgba(hex, 0.1);
  STATE_LINE_COLORS[name] = hexToRgba(hex, 1);
}

const DEFAULT_STATE_FILL: RgbaColor = [34, 34, 34, 25];
const DEFAULT_STATE_LINE: RgbaColor = [34, 34, 34, 255];

interface ResolvedStyle {
  fillColor: [number, number, number, number];
  /** Primary stripe color (active layer, or first layer). Used as solid base for multi-layer codes. */
  primaryFillColor: [number, number, number, number];
  /** Secondary stripe color (blended remaining layers). Pattern-masked on top of primary. */
  secondaryFillColor: [number, number, number, number];
  lineColor: [number, number, number, number];
  lineWidth: number;
  /** Number of visible layers that include this postal code. */
  count: number;
  /** True when all contributing layers have the same or very similar color. */
  isSameColor: boolean;
}

interface StyleAccumulator {
  fillWeighted: [number, number, number, number];
  lineWeighted: [number, number, number, number];
  weightSum: number;
  hasActive: boolean;
  count: number;
  /** Hex colors of all contributing layers (for same-color detection). */
  layerColors: string[];
  /** Per-layer fill colors with active flag, in accumulation order. */
  layerFillEntries: { color: RgbaColor; isActive: boolean }[];
}

const COUNTRY_BORDER_COLORS: Record<string, [number, number, number, number]> =
  {
    DE: [30, 41, 59, 230],
    AT: [127, 29, 29, 230],
    CH: [120, 53, 15, 230],
  };
const DEFAULT_COUNTRY_BORDER_COLOR: [number, number, number, number] = [
  17, 24, 39, 230,
];

function toAccumulator(): StyleAccumulator {
  return {
    fillWeighted: [0, 0, 0, 0],
    lineWeighted: [0, 0, 0, 0],
    weightSum: 0,
    hasActive: false,
    count: 0,
    layerColors: [],
    layerFillEntries: [],
  };
}

function blendAccumulator(acc: StyleAccumulator): ResolvedStyle {
  const weight = Math.max(acc.weightSum, 1);
  const avgFill: [number, number, number, number] = [
    Math.round(acc.fillWeighted[0] / weight),
    Math.round(acc.fillWeighted[1] / weight),
    Math.round(acc.fillWeighted[2] / weight),
    Math.round(acc.fillWeighted[3] / weight),
  ];
  const avgLine: [number, number, number, number] = [
    Math.round(acc.lineWeighted[0] / weight),
    Math.round(acc.lineWeighted[1] / weight),
    Math.round(acc.lineWeighted[2] / weight),
    255,
  ];

  // Detect same-color conflict: all contributing layers share similar hue
  let isSameColor = false;
  if (acc.count >= 2 && acc.layerColors.length >= 2) {
    isSameColor = acc.layerColors.every((c) =>
      hexColorsAreSimilar(acc.layerColors[0], c, 60)
    );
  }

  if (acc.count <= 1) {
    return {
      fillColor: avgFill,
      primaryFillColor: avgFill,
      secondaryFillColor: avgFill,
      lineColor: avgLine,
      lineWidth: acc.hasActive ? 2.5 : 1.5,
      count: acc.count,
      isSameColor: false,
    };
  }

  // Primary: active layer's color (or first layer if none active) — same alpha as single-layer fills
  const primaryEntry =
    acc.layerFillEntries.find((e) => e.isActive) ?? acc.layerFillEntries[0];
  const primaryFillColor: RgbaColor = primaryEntry
    ? primaryEntry.color
    : avgFill;

  // Secondary: blend of all other layers' fill colors — same alpha as single-layer fills
  const secondaryEntries = acc.layerFillEntries.filter(
    (e) => e !== primaryEntry
  );
  let secondaryFillColor: RgbaColor;
  if (secondaryEntries.length === 0) {
    secondaryFillColor = primaryFillColor;
  } else if (secondaryEntries.length === 1) {
    secondaryFillColor = secondaryEntries[0].color;
  } else {
    const n = secondaryEntries.length;
    secondaryFillColor = [
      Math.round(secondaryEntries.reduce((s, e) => s + e.color[0], 0) / n),
      Math.round(secondaryEntries.reduce((s, e) => s + e.color[1], 0) / n),
      Math.round(secondaryEntries.reduce((s, e) => s + e.color[2], 0) / n),
      Math.round(secondaryEntries.reduce((s, e) => s + e.color[3], 0) / n),
    ];
  }

  return {
    fillColor: [
      avgFill[0],
      avgFill[1],
      avgFill[2],
      Math.min(210, avgFill[3] + 45),
    ],
    primaryFillColor,
    secondaryFillColor,
    lineColor: [avgLine[0], avgLine[1], avgLine[2], 255],
    lineWidth: acc.hasActive ? 2.5 : 1.5,
    count: acc.count,
    isSameColor,
  };
}

/**
 * Build a Map from composite key (country:code) → resolved visual style.
 * Keys match the featureIndex format from getFeatureCode().
 * `country` is used to prefix raw DB postal codes (e.g. "01067" → "DE:01067").
 *
 * Also returns `multiLayerCodes` (codes in 2+ visible layers) and
 * `sameColorCodes` (subset where all contributing layers share a similar color).
 */
function buildResolvedStyleMap(
  layers: Layer[] | undefined,
  activeLayerId: number | null | undefined,
  country?: string
): {
  map: Map<string, ResolvedStyle>;
  version: string;
  multiLayerCodes: Set<string>;
  sameColorCodes: Set<string>;
} {
  const result = new Map<string, ResolvedStyle>();
  const multiLayerCodes = new Set<string>();
  const sameColorCodes = new Set<string>();

  if (!layers) {
    return { map: result, version: "", multiLayerCodes, sameColorCodes };
  }
  const byCode = new Map<string, StyleAccumulator>();
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

    versionParts.push(`${layer.id}:${layer.color}:${opacity}:${isActive}`);

    for (const rawCode of postalCodes) {
      const key = country ? `${country}:${rawCode}` : rawCode;
      const existing = byCode.get(key) ?? toAccumulator();
      const weight = isActive ? 2 : 1;
      existing.fillWeighted = [
        existing.fillWeighted[0] + fillColor[0] * weight,
        existing.fillWeighted[1] + fillColor[1] * weight,
        existing.fillWeighted[2] + fillColor[2] * weight,
        existing.fillWeighted[3] + fillColor[3] * weight,
      ];
      existing.lineWeighted = [
        existing.lineWeighted[0] + lineColor[0] * weight,
        existing.lineWeighted[1] + lineColor[1] * weight,
        existing.lineWeighted[2] + lineColor[2] * weight,
        existing.lineWeighted[3] + lineColor[3] * weight,
      ];
      existing.weightSum += weight;
      existing.hasActive = existing.hasActive || isActive;
      existing.count += 1;
      existing.layerColors.push(layer.color);
      existing.layerFillEntries.push({ color: fillColor, isActive });
      byCode.set(key, existing);
    }
  }

  for (const [code, acc] of byCode) {
    const style = blendAccumulator(acc);
    // Preserve existing behavior where single-layer width follows active state.
    if (acc.count <= 1) {
      style.lineWidth = acc.hasActive ? 2.5 : 1.5;
    }
    // Keep a soft minimum for visibility.
    style.lineWidth = Math.max(style.lineWidth, 1.5);
    result.set(code, style);

    if (acc.count >= 2) {
      multiLayerCodes.add(code);
      if (style.isSameColor) {
        sameColorCodes.add(code);
      }
    }
  }

  return {
    map: result,
    version: versionParts.join("|"),
    multiLayerCodes,
    sameColorCodes,
  };
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
  countryShapesData?: FeatureCollection<Polygon | MultiPolygon> | null;
  layers?: Layer[];
  activeLayerId?: number | null;
  previewPostalCode?: string | null;
  featureIndex?: Map<string, Feature<Polygon | MultiPolygon>[]>;
  isCursorMode: boolean;
  mapCanvasRef: RefObject<HTMLCanvasElement | null>;
  /** Country code for the area — used to prefix raw postal codes for DACH matching. */
  country?: string;
  /** ID of basemap symbol layer to insert deck.gl layers before (for z-ordering). */
  beforeId?: string;
  /** Set of composite postal codes (e.g. "DE:12345") to highlight on the map. */
  highlightedCodes?: Set<string> | null;
}

/**
 * Hook that returns all deck.gl layer instances for the map.
 * Only polygon/fill/interaction layers — labels stay in MapLibre (hybrid approach).
 */
export function useDeckLayers({
  data,
  statesData,
  countryShapesData,
  layers,
  activeLayerId,
  previewPostalCode,
  featureIndex,
  isCursorMode,
  mapCanvasRef,
  country,
  beforeId,
  highlightedCodes,
}: UseDeckLayersProps) {
  // Hover state: store the currently hovered feature for the outline layer
  const [hoveredFeature, setHoveredFeature] = useState<Feature<
    Polygon | MultiPolygon
  > | null>(null);
  const hoveredCodeRef = useRef<string | null>(null);

  // Stripe pattern texture atlas — created once per browser session (client-only)
  const stripeAtlas = useMemo(() => createStripePatternAtlas(), []);

  // Resolve per-postal-code styles from all area layers (keyed by country:code)
  const {
    map: resolvedStyles,
    version: resolvedStylesVersion,
    multiLayerCodes,
    sameColorCodes,
  } = useMemo(
    () => buildResolvedStyleMap(layers, activeLayerId, country),
    [layers, activeLayerId, country]
  );

  // Stable set of composite keys (country:code) across all visible layers.
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
      for (const rawCode of postalCodes) {
        codes.add(country ? `${country}:${rawCode}` : rawCode);
      }
    }
    return codes;
  }, [layers, country]);

  // Single-layer code set (codes in exactly one visible layer)
  const singleLayerCodeSet = useMemo(() => {
    const codes = new Set<string>();
    for (const code of resolvedCodeSet) {
      if (!multiLayerCodes.has(code)) {
        codes.add(code);
      }
    }
    return codes;
  }, [resolvedCodeSet, multiLayerCodes]);

  // Pre-filtered area features split by single vs multi-layer membership
  const singleLayerFeaturesData = useMemo(
    () => filterAreaFeatures(data, singleLayerCodeSet, featureIndex),
    [data, singleLayerCodeSet, featureIndex]
  );

  const multiLayerFeaturesData = useMemo(
    () => filterAreaFeatures(data, multiLayerCodes, featureIndex),
    [data, multiLayerCodes, featureIndex]
  );

  // Preview feature data — try composite key lookup (country:code) for DACH dedup
  const previewData = useMemo(() => {
    if (!previewPostalCode || !featureIndex) {
      return EMPTY_FEATURE_COLLECTION as FeatureCollection<
        Polygon | MultiPolygon
      >;
    }
    // Try with area's country prefix first, then try all DACH prefixes
    const prefixedKey = country
      ? `${country}:${previewPostalCode}`
      : previewPostalCode;
    let features = featureIndex.get(prefixedKey);
    if (!features) {
      // Fallback: search all country prefixes for the code
      for (const cc of ["DE", "AT", "CH"]) {
        features = featureIndex.get(`${cc}:${previewPostalCode}`);
        if (features) {
          break;
        }
      }
    }
    if (!features || features.length === 0) {
      return EMPTY_FEATURE_COLLECTION as FeatureCollection<
        Polygon | MultiPolygon
      >;
    }
    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [previewPostalCode, featureIndex, country]);

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
            beforeId,
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
            lineWidthMinPixels: 1,
            lineWidthMaxPixels: 4,
            pickable: false,
            updateTriggers: {
              getFillColor: [],
              getLineColor: [],
            },
          })
        : null,
    [statesData, beforeId]
  );

  const countryBordersLayer = useMemo(
    () =>
      countryShapesData
        ? new GeoJsonLayer({
            id: "country-borders",
            data: countryShapesData,
            beforeId,
            filled: false,
            stroked: true,
            getLineColor: (f) => {
              const cc = (f as Feature<Polygon | MultiPolygon>).properties
                ?.country as string;
              return COUNTRY_BORDER_COLORS[cc] ?? DEFAULT_COUNTRY_BORDER_COLOR;
            },
            getLineWidth: 5,
            lineWidthUnits: "pixels" as const,
            lineWidthMinPixels: 3,
            lineWidthMaxPixels: 8,
            lineJointRounded: true,
            lineCapRounded: true,
            pickable: false,
            updateTriggers: {
              getLineColor: [],
            },
          })
        : null,
    [countryShapesData, beforeId]
  );

  // Conflict-highlight feature collection (memoized on codes + data)
  const highlightData = useMemo(
    () =>
      highlightedCodes && highlightedCodes.size > 0
        ? filterAreaFeatures(data, highlightedCodes, featureIndex)
        : (EMPTY_FEATURE_COLLECTION as FeatureCollection<
            Polygon | MultiPolygon
          >),
    [highlightedCodes, data, featureIndex]
  );

  // Build all deck.gl layers
  const deckLayers = useMemo(() => {
    const result: GeoJsonLayer[] = [];

    if (stateBoundariesLayer) {
      result.push(stateBoundariesLayer);
    }

    if (countryBordersLayer) {
      result.push(countryBordersLayer);
    }

    // Base postal code layer — THE ONLY pickable layer
    result.push(
      new GeoJsonLayer({
        id: "postal-codes",
        data,
        beforeId,
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

    // Solid area overlay — postal codes in exactly one visible layer
    result.push(
      new GeoJsonLayer({
        id: "area-layers-solid",
        data: singleLayerFeaturesData,
        beforeId,
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
          return code ? (resolvedStyles.get(code)?.lineWidth ?? 1.5) : 1.5;
        },
        lineWidthUnits: "pixels" as const,
        pickable: false,
        updateTriggers: {
          getFillColor: [resolvedStylesVersion],
          getLineColor: [resolvedStylesVersion],
          getLineWidth: [resolvedStylesVersion],
        },
      })
    );

    // Stripe area overlay — postal codes shared by 2+ visible layers.
    // Rendered as two passes:
    //   base: solid primary color fill (active/first layer's color)
    //   top:  secondary color through a stripe/crosshatch pattern on top
    // Together these produce true alternating two-color stripes.
    if (stripeAtlas) {
      // Base pass — solid fill with primary (active/first) layer color
      result.push(
        new GeoJsonLayer({
          id: "area-layers-stripe-base",
          data: multiLayerFeaturesData,
          beforeId,
          filled: true,
          stroked: true,
          getFillColor: (f) => {
            const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
            return code
              ? (resolvedStyles.get(code)?.primaryFillColor ?? [0, 0, 0, 0])
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
            return code ? (resolvedStyles.get(code)?.lineWidth ?? 1.5) : 1.5;
          },
          lineWidthUnits: "pixels" as const,
          pickable: false,
          updateTriggers: {
            getFillColor: [resolvedStylesVersion],
            getLineColor: [resolvedStylesVersion],
            getLineWidth: [resolvedStylesVersion],
          },
        })
      );
      // Top pass — secondary color masked through stripe/crosshatch pattern, no stroke (base handles it)
      result.push(
        new GeoJsonLayer({
          id: "area-layers-stripe-top",
          data: multiLayerFeaturesData,
          beforeId,
          filled: true,
          stroked: false,
          getFillColor: (f) => {
            const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
            return code
              ? (resolvedStyles.get(code)?.secondaryFillColor ?? [0, 0, 0, 0])
              : [0, 0, 0, 0];
          },
          lineWidthUnits: "pixels" as const,
          pickable: false,
          extensions: [new FillStyleExtension({ pattern: true })],
          fillPatternAtlas: stripeAtlas.canvas,
          fillPatternMapping: stripeAtlas.mapping,
          getFillPattern: (f: unknown) => {
            const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
            return code && sameColorCodes.has(code) ? "cross" : "stripe";
          },
          getFillPatternScale: 2500,
          getFillPatternOffset: [0, 0],
          updateTriggers: {
            getFillColor: [resolvedStylesVersion],
            getFillPattern: [resolvedStylesVersion],
          },
        })
      );
    } else {
      // Fallback when canvas is unavailable (SSR): solid blended fill with stroke
      result.push(
        new GeoJsonLayer({
          id: "area-layers-stripe-base",
          data: multiLayerFeaturesData,
          beforeId,
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
            return code ? (resolvedStyles.get(code)?.lineWidth ?? 1.5) : 1.5;
          },
          lineWidthUnits: "pixels" as const,
          pickable: false,
          updateTriggers: {
            getFillColor: [resolvedStylesVersion],
            getLineColor: [resolvedStylesVersion],
            getLineWidth: [resolvedStylesVersion],
          },
        })
      );
    }

    // Preview layer — always present to avoid MapLibre add/remove churn
    result.push(
      new GeoJsonLayer({
        id: "preview-layer",
        data: previewData,
        beforeId,
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
        beforeId,
        filled: false,
        stroked: true,
        getLineColor: [37, 99, 235, 255],
        getLineWidth: 3,
        lineWidthUnits: "pixels" as const,
        pickable: false,
      })
    );

    // Conflict-highlight outline layer
    if (highlightData.features.length > 0) {
      result.push(
        new GeoJsonLayer({
          id: "conflict-highlight",
          data: highlightData,
          beforeId,
          filled: true,
          stroked: true,
          getFillColor: [255, 165, 0, 50],
          getLineColor: [255, 165, 0, 255],
          getLineWidth: 3,
          lineWidthUnits: "pixels" as const,
          pickable: false,
        })
      );
    }

    return result;
  }, [
    stateBoundariesLayer,
    countryBordersLayer,
    data,
    singleLayerFeaturesData,
    multiLayerFeaturesData,
    resolvedStyles,
    resolvedStylesVersion,
    sameColorCodes,
    stripeAtlas,
    previewData,
    hoverData,
    highlightData,
    isCursorMode,
    beforeId,
  ]);

  return {
    deckLayers,
    onHover,
  } as const;
}
