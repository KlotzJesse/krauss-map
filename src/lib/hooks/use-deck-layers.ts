import type { PickingInfo } from "@deck.gl/core";
import { FillStyleExtension } from "@deck.gl/extensions";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";

import type { Layer } from "@/lib/types/area-types";
import {
  EMPTY_FEATURE_COLLECTION,
  compositeKeyToStoredCode,
  extractRawCode,
  getFeatureCode,
  hexToRgba,
  resolveFeatureKey,
} from "@/lib/utils/deck-gl-utils";
import {
  createStripePatternAtlas,
  hexColorsAreSimilar,
} from "@/lib/utils/stripe-pattern";

// Pre-computed RGBA arrays for state colors — avoids per-feature hexToRgba in accessors.
// Fill colors at 10% opacity, line colors at full opacity.
type RgbaColor = [number, number, number, number];

const STATE_FILL_COLORS: Record<string, RgbaColor> = {};
const STATE_LINE_COLORS: Record<string, RgbaColor> = {};

const STATE_HEX_COLORS: Record<string, string> = {
  // Germany (16 Bundesländer) — golden-angle hues from 0°, S=65%, L=56%
  "Baden-Württemberg": "#d84646",
  Bayern: "#46d870",
  Berlin: "#9b46d8",
  Brandenburg: "#d8c646",
  Bremen: "#46bfd8",
  Hamburg: "#d84695",
  Hessen: "#6ad846",
  "Mecklenburg-Vorpommern": "#4c46d8",
  Niedersachsen: "#d87746",
  "Nordrhein-Westfalen": "#46d8a1",
  "Rheinland-Pfalz": "#cc46d8",
  Saarland: "#b9d846",
  Sachsen: "#468fd8",
  "Sachsen-Anhalt": "#d84664",
  "Schleswig-Holstein": "#46d852",
  Thüringen: "#7d46d8",
  // Austria (9 Bundesländer) — golden-angle hues from 22°, S=68%, L=54%
  Burgenland: "#d9743a",
  Kärnten: "#3ad9a3",
  Niederösterreich: "#d23ad9",
  Oberösterreich: "#b3d93a",
  Salzburg: "#3a84d9",
  Steiermark: "#d93a56",
  Tirol: "#3ad94d",
  Vorarlberg: "#7b3ad9",
  Wien: "#d9aa3a",
  // Switzerland (26 Kantone) — golden-angle hues from 11°, S=63%, L=57%
  Zürich: "#d6664c",
  Bern: "#4cd68e",
  Luzern: "#b64cd6",
  Uri: "#ced64c",
  Schwyz: "#4ca6d6",
  Obwalden: "#d64c7e",
  Nidwalden: "#55d64c",
  Glarus: "#6b4cd6",
  Zug: "#d6944c",
  Fribourg: "#4cd6bc",
  Solothurn: "#d64cc8",
  "Basel-Stadt": "#a0d64c",
  "Basel-Landschaft": "#4c78d6",
  Schaffhausen: "#d64c4f",
  "Appenzell Ausserrhoden": "#4cd671",
  "Appenzell Innerrhoden": "#9a4cd6",
  "St. Gallen": "#d6c24c",
  Graubünden: "#4cc3d6",
  Aargau: "#d64c9a",
  Thurgau: "#72d64c",
  Ticino: "#4f4cd6",
  Vaud: "#d6774c",
  Valais: "#4cd6a0",
  Neuchâtel: "#c84cd6",
  Genève: "#bdd64c",
  Jura: "#4c94d6",
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
  /** RGBA colors of all contributing layers (for dashed outline on duplicates). */
  layerLineColors: [number, number, number, number][];
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
    // Germany: deep royal blue — professional, map-quality, clearly German
    DE: [29, 78, 216, 220],
    // Austria: deep crimson — flag-inspired, distinct from DE blue
    AT: [185, 28, 28, 220],
    // Switzerland: emerald green — fully distinct from DE and AT, clean cartographic
    CH: [5, 150, 105, 220],
  };
const DEFAULT_COUNTRY_BORDER_COLOR: [number, number, number, number] = [
  71, 85, 105, 220,
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

  // Extract RGB colors from layerFillEntries for the outline
  const layerLineColors = acc.layerFillEntries.map((entry) => {
    const [r, g, b] = entry.color;
    return [r, g, b, 255] as [number, number, number, number];
  });

  if (acc.count <= 1) {
    return {
      fillColor: avgFill,
      primaryFillColor: avgFill,
      secondaryFillColor: avgFill,
      lineColor: avgLine,
      lineWidth: acc.hasActive ? 2.5 : 1.5,
      count: acc.count,
      isSameColor: false,
      layerLineColors,
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
    let sr = 0,
      sg = 0,
      sb = 0,
      sa = 0;
    for (const e of secondaryEntries) {
      sr += e.color[0];
      sg += e.color[1];
      sb += e.color[2];
      sa += e.color[3];
    }
    secondaryFillColor = [
      Math.round(sr / n),
      Math.round(sg / n),
      Math.round(sb / n),
      Math.round(sa / n),
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
    layerLineColors,
  };
}

/**
 * Build a Map from composite key (country:code) → resolved visual style.
 * Keys match the featureIndex format from getFeatureCode().
 * `country` is used to prefer the area's own country when resolving codes.
 * `featureIndex` enables cross-country resolution (e.g., AT codes in a DE area).
 *
 * Also returns `multiLayerCodes` (codes in 2+ visible layers) and
 * `sameColorCodes` (subset where all contributing layers share a similar color).
 */
function buildResolvedStyleMap(
  layers: Layer[] | undefined,
  activeLayerId: number | null | undefined,
  country?: string,
  featureIndex?: Map<string, Feature<Polygon | MultiPolygon>[]>
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
      const key = resolveFeatureKey(rawCode, country, featureIndex);
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
  /** When true, renders a highlight overlay for postal codes not assigned to any layer. */
  showUnassigned?: boolean;
  /** Ref to the tooltip DOM element — updated directly to avoid React re-renders on hover. */
  hoverTooltipRef?: RefObject<HTMLDivElement | null>;
  /**
   * Ref to the MapboxOverlay instance (from DeckGLOverlay).
   * Hover outline is applied via overlay.setProps() directly — no React state change,
   * so MapInner does not re-render on every hover boundary crossing.
   */
  overlayRef?: MutableRefObject<MapboxOverlay | null>;
  /** Ref that is true while the map is being panned/zoomed — hover picking is skipped. */
  isMapInteractingRef?: RefObject<boolean>;
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
  showUnassigned = false,
  hoverTooltipRef,
  overlayRef,
  isMapInteractingRef,
}: UseDeckLayersProps) {
  // Hover tracking — ref only, no state. Hover updates go directly to overlay.setProps().
  const hoveredCodeRef = useRef<string | null>(null);
  // Always-current deckLayers reference for direct overlay updates in onHover.
  // Initialized empty; updated each render after deckLayers useMemo runs.
  const deckLayersRef = useRef<GeoJsonLayer[]>([]);

  // Stripe pattern texture atlas — created once per browser session (client-only)
  const stripeAtlas = useMemo(() => createStripePatternAtlas(), []);

  // Resolve per-postal-code styles from all area layers (keyed by country:code).
  // resolvedStyles is stored in a ref so that style-only changes (color, opacity,
  // active layer) don't cause the deckLayers useMemo to rebuild all GeoJsonLayer
  // instances. Instead, deck.gl's updateTriggers (keyed by resolvedStylesVersion)
  // tell it to re-evaluate accessor functions which read from the ref.
  const resolvedStylesRef = useRef<Map<string, ResolvedStyle>>(new Map());
  const prevMultiLayerCodesRef = useRef<Set<string>>(new Set());
  const prevSameColorCodesRef = useRef<Set<string>>(new Set());

  // Shared Set-stabilization logic used by both sync and async paths
  const stabilizeSets = useCallback(
    (result: ReturnType<typeof buildResolvedStyleMap>) => {
      const prevMulti = prevMultiLayerCodesRef.current;
      if (
        prevMulti.size === result.multiLayerCodes.size &&
        [...result.multiLayerCodes].every((c) => prevMulti.has(c))
      ) {
        result.multiLayerCodes = prevMulti;
      } else {
        prevMultiLayerCodesRef.current = result.multiLayerCodes;
      }
      const prevSame = prevSameColorCodesRef.current;
      if (
        prevSame.size === result.sameColorCodes.size &&
        [...result.sameColorCodes].every((c) => prevSame.has(c))
      ) {
        result.sameColorCodes = prevSame;
      } else {
        prevSameColorCodesRef.current = result.sameColorCodes;
      }
      return result;
    },
    []
  );

  // First-render sync seed — populates refs immediately so deck.gl has styles
  // before the worker responds. Also used as SSR/Worker-unavailable fallback.
  const initialResult = useMemo(() => {
    const result = buildResolvedStyleMap(layers, activeLayerId, country, featureIndex);
    resolvedStylesRef.current = result.map;
    return stabilizeSets(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount only

  const [resolvedStylesState, setResolvedStylesState] = useState<{
    version: string;
    multiLayerCodes: Set<string>;
    sameColorCodes: Set<string>;
  }>({
    version: initialResult.version,
    multiLayerCodes: initialResult.multiLayerCodes,
    sameColorCodes: initialResult.sameColorCodes,
  });

  // Web Worker lifecycle — created once, terminated on unmount
  const workerRef = useRef<Worker | null>(null);
  const workerRequestIdRef = useRef(0);
  const lastAppliedWorkerRequestIdRef = useRef(0);
  useEffect(() => {
    if (typeof Worker === "undefined") return; // SSR guard
    const worker = new Worker(
      new URL("../workers/resolve-styles.worker.ts", import.meta.url)
    );
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Dispatch to worker on input changes; fall back to sync when worker unavailable
  useEffect(() => {
    const featureIndexKeys = featureIndex
      ? [...featureIndex.keys()]
      : ([] as string[]);

    // Apply a synchronous style pass first so add/remove interactions paint instantly.
    const syncResult = buildResolvedStyleMap(
      layers,
      activeLayerId,
      country,
      featureIndex
    );
    resolvedStylesRef.current = syncResult.map;
    const syncStable = stabilizeSets(syncResult);
    setResolvedStylesState((prev) => {
      if (
        prev.version === syncStable.version &&
        prev.multiLayerCodes === syncStable.multiLayerCodes &&
        prev.sameColorCodes === syncStable.sameColorCodes
      ) {
        return prev;
      }
      return {
        version: syncStable.version,
        multiLayerCodes: syncStable.multiLayerCodes,
        sameColorCodes: syncStable.sameColorCodes,
      };
    });

    if (!workerRef.current) {
      return;
    }

    const worker = workerRef.current;
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      requestId: number;
      styleEntries: [string, ResolvedStyle][];
      multiLayerCodes: string[];
      sameColorCodes: string[];
      version: string;
    }>) => {
      if (data.requestId < lastAppliedWorkerRequestIdRef.current) {
        return;
      }
      lastAppliedWorkerRequestIdRef.current = data.requestId;
      resolvedStylesRef.current = new Map(data.styleEntries);
      const workerResult = {
        map: resolvedStylesRef.current,
        version: data.version,
        multiLayerCodes: new Set(data.multiLayerCodes),
        sameColorCodes: new Set(data.sameColorCodes),
      };
      const stable = stabilizeSets(workerResult);
      setResolvedStylesState({
        version: stable.version,
        multiLayerCodes: stable.multiLayerCodes,
        sameColorCodes: stable.sameColorCodes,
      });
    };

    const requestId = ++workerRequestIdRef.current;
    worker.postMessage({
      requestId,
      layers,
      activeLayerId,
      country,
      featureIndexKeys,
    });
  }, [layers, activeLayerId, country, featureIndex, stabilizeSets]);

  const resolvedStylesVersion = resolvedStylesState.version;
  const multiLayerCodes = resolvedStylesState.multiLayerCodes;
  const sameColorCodes = resolvedStylesState.sameColorCodes;

  // Stable set of composite keys (country:code) across all visible layers.
  // Ref-stabilized: returns same Set reference when only colors/opacity changed
  // (not membership), preventing cascading FeatureCollection rebuilds.
  const prevResolvedCodeSetRef = useRef<Set<string>>(new Set());
  const resolvedCodeSet = useMemo(() => {
    const codes = new Set<string>();
    if (!layers) return codes;
    for (const layer of layers) {
      if (layer.isVisible !== "true") continue;
      for (const pc of layer.postalCodes ?? []) {
        codes.add(resolveFeatureKey(pc.postalCode, country, featureIndex));
      }
    }
    const prev = prevResolvedCodeSetRef.current;
    if (prev.size === codes.size && [...codes].every((c) => prev.has(c))) {
      return prev;
    }
    prevResolvedCodeSetRef.current = codes;
    return codes;
  }, [layers, country, featureIndex]);

  // All assigned codes (across all layers, regardless of visibility) — used for unassigned overlay.
  const prevAllAssignedRef = useRef<Set<string>>(new Set());
  const allAssignedCodeSet = useMemo(() => {
    const codes = new Set<string>();
    if (!layers) return codes;
    for (const layer of layers) {
      for (const pc of layer.postalCodes ?? []) {
        codes.add(resolveFeatureKey(pc.postalCode, country, featureIndex));
      }
    }
    const prev = prevAllAssignedRef.current;
    if (prev.size === codes.size && [...codes].every((c) => prev.has(c))) {
      return prev;
    }
    prevAllAssignedRef.current = codes;
    return codes;
  }, [layers, country, featureIndex]);

  // Countries that have at least one assigned code (extracted from composite "CC:code" keys).
  const countriesInUse = useMemo(() => {
    const used = new Set<string>();
    for (const key of allAssignedCodeSet) {
      const c = key.split(":")[0];
      if (c && c.length === 2) used.add(c);
    }
    return used;
  }, [allAssignedCodeSet]);

  // Composite keys of features whose country is not represented in any layer.
  // Uses featureIndex keys (unique codes) instead of iterating all features — O(unique codes) vs O(features).
  const inactiveCountryCodes = useMemo(() => {
    if (countriesInUse.size === 0 || !featureIndex) return new Set<string>();
    const inactive = new Set<string>();
    for (const code of featureIndex.keys()) {
      const c = code.split(":")[0];
      if (c && !countriesInUse.has(c)) inactive.add(code);
    }
    return inactive;
  }, [countriesInUse, featureIndex]);

  const inactiveCountryFeaturesData = useMemo(
    () =>
      inactiveCountryCodes.size > 0
        ? filterAreaFeatures(data, inactiveCountryCodes, featureIndex)
        : (EMPTY_FEATURE_COLLECTION as FeatureCollection<
            Polygon | MultiPolygon
          >),
    [inactiveCountryCodes, data, featureIndex]
  );

  // Unassigned feature data — postal codes not in any layer, excluding inactive-country codes.
  // Uses featureIndex keys instead of iterating all features to collect unique codes.
  const unassignedFeaturesData = useMemo(() => {
    if (!showUnassigned || !featureIndex)
      return EMPTY_FEATURE_COLLECTION as FeatureCollection<
        Polygon | MultiPolygon
      >;
    const unassignedCodes = new Set<string>();
    for (const code of featureIndex.keys()) {
      if (!allAssignedCodeSet.has(code) && !inactiveCountryCodes.has(code))
        unassignedCodes.add(code);
    }
    return filterAreaFeatures(data, unassignedCodes, featureIndex);
  }, [
    showUnassigned,
    data,
    allAssignedCodeSet,
    inactiveCountryCodes,
    featureIndex,
  ]);

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

  const hasMultiLayerCodes = multiLayerFeaturesData.features.length > 0;
  const hasThreePlusLayerCodes = useMemo(() => {
    if (!hasMultiLayerCodes) {
      return false;
    }
    for (const code of multiLayerCodes) {
      const style = resolvedStylesRef.current.get(code);
      if ((style?.layerLineColors.length ?? 0) >= 3) {
        return true;
      }
    }
    return false;
  }, [hasMultiLayerCodes, multiLayerCodes, resolvedStylesVersion]);

  // Preview feature data — try composite key lookup (country:code) for DACH dedup
  const previewData = useMemo(() => {
    if (!previewPostalCode || !featureIndex) {
      return EMPTY_FEATURE_COLLECTION as FeatureCollection<
        Polygon | MultiPolygon
      >;
    }
    // Resolve stored/raw preview code to canonical composite key first.
    const previewKey = resolveFeatureKey(previewPostalCode, country, featureIndex);
    let features = featureIndex.get(previewKey);
    if (!features) {
      const rawCode = extractRawCode(previewPostalCode);
      // Fallback: search all country prefixes for the raw code
      for (const cc of ["DE", "AT", "CH"]) {
        features = featureIndex.get(`${cc}:${rawCode}`);
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

  // Handle hover from deck.gl picking — cursor set via direct DOM mutation (no React re-render)
  // hoverTooltip is managed via DOM ref to avoid MapInner re-renders on every mouse move
  const hoverTooltipRefInternal = useRef<HTMLDivElement | null>(null);
  const effectiveTooltipRef = hoverTooltipRef ?? hoverTooltipRefInternal;

  const lastTooltipCodeRef = useRef<string | null>(null);
  const lastTooltipLayersKeyRef = useRef<string>("");
  const layerMembershipByPostalCode = useMemo(() => {
    const memberships = new Map<
      string,
      Array<{ name: string; color: string }>
    >();
    for (const layer of layers ?? []) {
      const layerInfo = { name: layer.name, color: layer.color };
      for (const postalCodeEntry of layer.postalCodes ?? []) {
        const postalCode = postalCodeEntry.postalCode;
        const current = memberships.get(postalCode);
        if (current) {
          current.push(layerInfo);
        } else {
          memberships.set(postalCode, [layerInfo]);
        }
      }
    }
    return memberships;
  }, [layers]);

  const showTooltip = useCallback(
    (
      x: number,
      y: number,
      code: string,
      matchingLayers: Array<{ name: string; color: string }>
    ) => {
      const tooltipEl = effectiveTooltipRef.current;
      if (!tooltipEl) return;
      tooltipEl.style.left = `${x + 12}px`;
      tooltipEl.style.top = `${y - 10}px`;
      tooltipEl.style.display = "block";
      const layersKey = matchingLayers
        .map((layer) => `${layer.name}:${layer.color}`)
        .join("|");
      if (
        lastTooltipCodeRef.current === code &&
        lastTooltipLayersKeyRef.current === layersKey
      ) {
        return;
      }
      const codeEl = tooltipEl.querySelector<HTMLElement>(
        "[data-tooltip-code]"
      );
      const layersEl = tooltipEl.querySelector<HTMLElement>(
        "[data-tooltip-layers]"
      );
      if (codeEl) codeEl.textContent = code;
      if (layersEl) {
        layersEl.innerHTML = "";
        for (const l of matchingLayers) {
          const row = document.createElement("div");
          row.className = "flex items-center gap-1.5";
          const dot = document.createElement("span");
          dot.className = "inline-block w-2 h-2 rounded-full shrink-0";
          dot.style.backgroundColor = l.color;
          const name = document.createElement("span");
          name.className = "text-muted-foreground truncate max-w-[140px]";
          name.textContent = l.name;
          row.appendChild(dot);
          row.appendChild(name);
          layersEl.appendChild(row);
        }
      }
      lastTooltipCodeRef.current = code;
      lastTooltipLayersKeyRef.current = layersKey;
    },
    // effectiveTooltipRef is a stable ref object — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const hideTooltip = useCallback(() => {
    const tooltipEl = effectiveTooltipRef.current;
    if (tooltipEl) tooltipEl.style.display = "none";
    lastTooltipCodeRef.current = null;
    lastTooltipLayersKeyRef.current = "";
    // effectiveTooltipRef is a stable ref object — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onHover = useCallback(
    (info: PickingInfo) => {
      if (!isCursorMode) {
        return;
      }

      // Skip hover processing while the map is being panned/zoomed — avoids
      // expensive GeoJsonLayer creation + overlay.setProps() on every frame.
      if (isMapInteractingRef?.current) {
        return;
      }

      const canvas = mapCanvasRef.current;
      if (info.object) {
        const feature = info.object as Feature<Polygon | MultiPolygon>;
        const code = getFeatureCode(feature);
        if (code) {
          if (hoveredCodeRef.current !== code) {
            hoveredCodeRef.current = code;
            // Push hover outline directly to overlay — no React state change,
            // so MapInner does not re-render on hover.
            if (overlayRef?.current) {
              const hoverLayer = new GeoJsonLayer({
                id: "hover-outline",
                data: {
                  type: "FeatureCollection" as const,
                  features: [feature],
                },
                beforeId,
                filled: false,
                stroked: true,
                getLineColor: [255, 255, 255, 230] as [
                  number,
                  number,
                  number,
                  number,
                ],
                getLineWidth: 2,
                lineWidthUnits: "pixels" as const,
                lineWidthMinPixels: 2,
                pickable: false,
              });
              overlayRef.current.setProps({
                layers: [...deckLayersRef.current, hoverLayer],
              });
            }
            if (canvas) {
              canvas.style.cursor = "pointer";
            }
          }
          // Resolve which layers contain this code
          // code is a composite featureIndex key like "CH:3800" — convert to stored
          // format so it matches pc.postalCode stored in the DB as "CH-3800"
          const storedCode = compositeKeyToStoredCode(code);
          const matchingLayers =
            layerMembershipByPostalCode.get(storedCode) ?? [];
          // Update tooltip via direct DOM — no React re-render
          showTooltip(
            info.x ?? 0,
            info.y ?? 0,
            extractRawCode(storedCode),
            matchingLayers
          );
        }
      } else if (hoveredCodeRef.current !== null) {
        hoveredCodeRef.current = null;
        // Remove hover outline directly
        if (overlayRef?.current) {
          overlayRef.current.setProps({ layers: deckLayersRef.current });
        }
        hideTooltip();
        if (canvas) {
          canvas.style.cursor = "grab";
        }
      }
    },
    [
      isCursorMode,
      mapCanvasRef,
      showTooltip,
      hideTooltip,
      overlayRef,
      beforeId,
      layerMembershipByPostalCode,
    ]
  );

  // Clear hover state when leaving cursor mode (e.g., switching to drawing).
  // Don't touch canvas cursor here — TerraDraw owns it during drawing modes.
  useEffect(() => {
    if (!isCursorMode) {
      hoveredCodeRef.current = null;
      if (overlayRef?.current) {
        overlayRef.current.setProps({ layers: deckLayersRef.current });
      }
      hideTooltip();
    }
  }, [isCursorMode, hideTooltip, overlayRef]);

  const clearHover = useCallback(() => {
    if (hoveredCodeRef.current === null) return;
    hoveredCodeRef.current = null;
    if (overlayRef?.current) {
      overlayRef.current.setProps({ layers: deckLayersRef.current });
    }
    hideTooltip();
  }, [overlayRef, hideTooltip]);

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
  const normalizedHighlightedCodes = useMemo(() => {
    if (!highlightedCodes || highlightedCodes.size === 0) {
      return null;
    }
    const normalized = new Set<string>();
    for (const code of highlightedCodes) {
      normalized.add(resolveFeatureKey(code, country, featureIndex));
    }
    return normalized;
  }, [highlightedCodes, country, featureIndex]);

  const highlightData = useMemo(
    () =>
      normalizedHighlightedCodes && normalizedHighlightedCodes.size > 0
        ? filterAreaFeatures(data, normalizedHighlightedCodes, featureIndex)
        : (EMPTY_FEATURE_COLLECTION as FeatureCollection<
            Polygon | MultiPolygon
          >),
    [normalizedHighlightedCodes, data, featureIndex]
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
        autoHighlight: false,
      })
    );

    // Inactive country overlay — codes from countries not used in any layer (shown grey)
    if (inactiveCountryCodes.size > 0) {
      result.push(
        new GeoJsonLayer({
          id: "inactive-country-overlay",
          data: inactiveCountryFeaturesData,
          beforeId,
          filled: true,
          stroked: true,
          getFillColor: [160, 160, 160, 25],
          getLineColor: [140, 140, 140, 60],
          getLineWidth: 0.5,
          lineWidthUnits: "pixels" as const,
          pickable: false,
        })
      );
    }

    // Unassigned PLZ overlay — postal codes not assigned to any layer
    if (showUnassigned) {
      result.push(
        new GeoJsonLayer({
          id: "unassigned-overlay",
          data: unassignedFeaturesData,
          beforeId,
          filled: true,
          stroked: true,
          getFillColor: [239, 68, 68, 55],
          getLineColor: [220, 38, 38, 160],
          getLineWidth: 1.5,
          lineWidthUnits: "pixels" as const,
          pickable: false,
        })
      );
    }

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
            ? (resolvedStylesRef.current.get(code)?.fillColor ?? [0, 0, 0, 0])
            : [0, 0, 0, 0];
        },
        getLineColor: (f) => {
          const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
          return code
            ? (resolvedStylesRef.current.get(code)?.lineColor ?? [0, 0, 0, 0])
            : [0, 0, 0, 0];
        },
        getLineWidth: (f) => {
          const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
          return code ? (resolvedStylesRef.current.get(code)?.lineWidth ?? 1.5) : 1.5;
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
              ? (resolvedStylesRef.current.get(code)?.primaryFillColor ?? [0, 0, 0, 0])
              : [0, 0, 0, 0];
          },
          getLineColor: (f) => {
            const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
            return code
              ? (resolvedStylesRef.current.get(code)?.lineColor ?? [0, 0, 0, 0])
              : [0, 0, 0, 0];
          },
          getLineWidth: (f) => {
            const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
            return code ? (resolvedStylesRef.current.get(code)?.lineWidth ?? 1.5) : 1.5;
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
              ? (resolvedStylesRef.current.get(code)?.secondaryFillColor ?? [0, 0, 0, 0])
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

      // Duplicate outline — multi-color outline for postal codes in 2+ layers
      // Creates alternating color dashes by rendering multiple thin strokes with offset opacity
      // First color with full opacity
      result.push(
        new GeoJsonLayer({
          id: "duplicate-outline-primary",
          data: multiLayerFeaturesData,
          beforeId,
          filled: false,
          stroked: true,
          getLineColor: (f) => {
            const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
            if (!code) return [0, 0, 0, 0];
            const style = resolvedStylesRef.current.get(code);
            if (!style || style.layerLineColors.length === 0) {
              return [0, 0, 0, 0];
            }
            const [r, g, b] = style.layerLineColors[0];
            return [r, g, b, 200] as [number, number, number, number];
          },
          getLineWidth: 2.5,
          lineWidthUnits: "pixels" as const,
          lineCap: "round" as const,
          lineJoint: "round" as const,
          pickable: false,
          updateTriggers: {
            getLineColor: [resolvedStylesVersion],
          },
        })
      );

      // Secondary color with semi-transparency for dashed effect
      if (hasMultiLayerCodes) {
        result.push(
          new GeoJsonLayer({
            id: "duplicate-outline-secondary",
            data: multiLayerFeaturesData,
            beforeId,
            filled: false,
            stroked: true,
            getLineColor: (f) => {
              const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
              if (!code) return [0, 0, 0, 0];
              const style = resolvedStylesRef.current.get(code);
              if (!style || style.layerLineColors.length < 2) {
                return [0, 0, 0, 0];
              }
              const [r, g, b] = style.layerLineColors[1];
              return [r, g, b, 110] as [number, number, number, number];
            },
            getLineWidth: 1.5,
            lineWidthUnits: "pixels" as const,
            lineCap: "round" as const,
            lineJoint: "round" as const,
            pickable: false,
            updateTriggers: {
              getLineColor: [resolvedStylesVersion],
            },
          })
        );
      }

      // Tertiary outline only when there are actual 3+ layer overlaps
      if (hasThreePlusLayerCodes) {
        result.push(
          new GeoJsonLayer({
            id: "duplicate-outline-tertiary",
            data: multiLayerFeaturesData,
            beforeId,
            filled: false,
            stroked: true,
            getLineColor: (f) => {
              const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
              if (!code) return [0, 0, 0, 0];
              const style = resolvedStylesRef.current.get(code);
              if (!style || style.layerLineColors.length < 3) {
                return [0, 0, 0, 0];
              }
              return [120, 120, 120, 90] as [number, number, number, number];
            },
            getLineWidth: 0.8,
            lineWidthUnits: "pixels" as const,
            lineCap: "butt" as const,
            lineJoint: "bevel" as const,
            pickable: false,
            updateTriggers: {
              getLineColor: [resolvedStylesVersion],
            },
          })
        );
      }
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
              ? (resolvedStylesRef.current.get(code)?.fillColor ?? [0, 0, 0, 0])
              : [0, 0, 0, 0];
          },
          getLineColor: (f) => {
            const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
            return code
              ? (resolvedStylesRef.current.get(code)?.lineColor ?? [0, 0, 0, 0])
              : [0, 0, 0, 0];
          },
          getLineWidth: (f) => {
            const code = getFeatureCode(f as Feature<Polygon | MultiPolygon>);
            return code ? (resolvedStylesRef.current.get(code)?.lineWidth ?? 1.5) : 1.5;
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
    resolvedStylesVersion,
    sameColorCodes,
    stripeAtlas,
    previewData,
    highlightData,
    isCursorMode,
    beforeId,
    hasMultiLayerCodes,
    hasThreePlusLayerCodes,
    showUnassigned,
    unassignedFeaturesData,
  ]);

  /** Count of unique postal codes not assigned to any layer, excluding inactive-country codes.
   *  Uses featureIndex keys (unique codes) — O(unique codes) instead of O(all features). */
  const unassignedCount = useMemo(() => {
    if (countriesInUse.size === 0 || !featureIndex) return 0;
    let count = 0;
    for (const code of featureIndex.keys()) {
      if (!allAssignedCodeSet.has(code) && !inactiveCountryCodes.has(code))
        count++;
    }
    return count;
  }, [featureIndex, allAssignedCodeSet, inactiveCountryCodes, countriesInUse]);

  // Keep deckLayersRef current after every render so onHover always reads the latest layers.
  deckLayersRef.current = deckLayers;

  return {
    deckLayers,
    onHover,
    clearHover,
    unassignedCount,
  } as const;
}
