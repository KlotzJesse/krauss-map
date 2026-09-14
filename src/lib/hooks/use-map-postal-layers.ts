"use client";

import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import type { PostalCodeIndex } from "@/lib/hooks/use-postal-code-index";
import {
  COUNTRY_BORDER_COLORS,
  DEFAULT_COUNTRY_BORDER_COLOR,
  DEFAULT_STATE_FILL,
  DEFAULT_STATE_LINE,
  STATE_FILL_COLORS,
  STATE_LINE_COLORS,
  usePostalStyleState,
} from "@/lib/hooks/use-postal-style-state";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { Layer } from "@/lib/types/area-types";
import { compositeKeyToStoredCode, extractRawCode } from "@/lib/utils/postal-code-keys";
import { createColoredPatternImage } from "@/lib/utils/stripe-pattern";

const SOURCE_ID = "postal-codes";
const SOURCE_LAYER = "plz";
const STATES_SOURCE_ID = "state-boundaries";
const COUNTRIES_SOURCE_ID = "country-shapes";

/**
 * Stripe layers are created per pattern, so their ids are not in LAYER_IDS.
 * `fill-pattern` is a cross-faded property that only accepts zoom and feature
 * properties — not feature-state — so it cannot be switched per code the way
 * the colours are. Each distinct pattern gets its own layer with a constant
 * pattern and a filter on the code key instead.
 */
const STRIPE_LAYER_PREFIX = "pc-stripe:";

/** Every layer this hook owns, in draw order. */
const LAYER_IDS = [
  "pc-states-fill",
  "pc-states-line",
  "pc-fill",
  "pc-line",
  "pc-dup1",
  "pc-dup2",
  "pc-dup3",
  "pc-preview-fill",
  "pc-preview-line",
  "pc-conflict-fill",
  "pc-conflict-line",
  "pc-hover-line",
  "pc-countries-line",
] as const;

type Rgba = [number, number, number, number];

const rgba = (c: Rgba): string =>
  `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(3)})`;

/** Per-code paint values, applied through MapLibre's feature-state. */
interface CodeState extends Record<string, unknown> {
  fill?: string;
  line?: string;
  lw?: number;
  l1?: string;
  l2?: string;
  l3?: string;
  preview?: boolean;
  conflict?: boolean;
}

/**
 * A paint expression that reads one feature-state key and falls back to a
 * constant when the code has no state — an unstyled code paints the base tint,
 * and the overlay layers paint nothing at all.
 */
function stateColor(key: string, fallback: string): ExpressionSpecification {
  return [
    "case",
    ["!=", ["feature-state", key], null],
    ["to-color", ["feature-state", key]],
    fallback,
  ] as ExpressionSpecification;
}

function stateNumber(key: string, fallback: number): ExpressionSpecification {
  return [
    "case",
    ["!=", ["feature-state", key], null],
    ["to-number", ["feature-state", key]],
    fallback,
  ] as ExpressionSpecification;
}

function stateFlagColor(key: string, on: string): ExpressionSpecification {
  return [
    "case",
    ["==", ["feature-state", key], true],
    on,
    "rgba(0,0,0,0)",
  ] as ExpressionSpecification;
}

/** Build a `match` expression from a name → colour map. */
function matchColor(
  property: string,
  colors: Record<string, Rgba>,
  fallback: Rgba
): ExpressionSpecification {
  const branches: unknown[] = ["match", ["get", property]];
  for (const [name, color] of Object.entries(colors)) {
    branches.push(name, rgba(color));
  }
  branches.push(rgba(fallback));
  return branches as unknown as ExpressionSpecification;
}

interface UseMapPostalLayersProps {
  map: MapLibreMap | null;
  isMapLoaded: boolean;
  /** Basemap symbol layer to insert below, so labels stay on top. */
  beforeId?: string;
  tileUrl: string;
  index: PostalCodeIndex;
  layers?: Layer[];
  activeLayerId?: number | null;
  previewPostalCode?: string | null;
  country?: string;
  granularity?: string;
  highlightedCodes?: Set<string> | null;
  showUnassigned?: boolean;
  isCursorMode: boolean;
  statesData?: FeatureCollection<Polygon | MultiPolygon> | null;
  countryShapesData?: FeatureCollection<Polygon | MultiPolygon> | null;
  hoverTooltipRef?: RefObject<HTMLDivElement | null>;
  mapCanvasRef: RefObject<HTMLCanvasElement | null>;
  isMapInteractingRef?: RefObject<boolean>;
  onCodeClick?: (storedCode: string, x: number, y: number) => void;
}

/**
 * Draws the postal codes as MapLibre style layers over the vector tile source:
 * base fill, per-layer colours, two-colour striping for codes that belong to
 * several layers, duplicate outlines, and the preview, conflict and hover
 * highlights.
 *
 * Per-code colour is applied through feature-state rather than by rebuilding
 * the data, so changing a layer's colour or visibility pushes a few thousand
 * small values and never re-tessellates the geometry.
 */
export function useMapPostalLayers({
  map,
  isMapLoaded,
  beforeId,
  tileUrl,
  index,
  layers,
  activeLayerId,
  previewPostalCode,
  country,
  granularity,
  highlightedCodes,
  showUnassigned = false,
  isCursorMode,
  statesData,
  countryShapesData,
  hoverTooltipRef,
  mapCanvasRef,
  isMapInteractingRef,
  onCodeClick,
}: UseMapPostalLayersProps) {
  const state = usePostalStyleState({
    index,
    layers,
    activeLayerId,
    previewPostalCode,
    country,
    granularity,
    highlightedCodes,
    showUnassigned,
    hoverTooltipRef,
  });

  const {
    resolvedStylesRef,
    resolvedStylesVersion,
    multiLayerCodes,
    sameColorCodes,
    singleLayerCodeSet,
    inactiveCountryCodes,
    unassignedCodes,
    unassignedCount,
    previewCodes,
    normalizedHighlightedCodes,
    layerMembershipByPostalCode,
    showTooltip,
    hideTooltip,
  } = state;

  const needsDupRef = useRef(false);
  const needsDup3Ref = useRef(false);
  const needsPreviewRef = useRef(false);
  const needsConflictRef = useRef(false);
  needsDupRef.current = multiLayerCodes.size > 0;
  needsDup3Ref.current = state.hasThreePlusLayerCodes;
  needsPreviewRef.current = previewCodes !== null;
  needsConflictRef.current =
    normalizedHighlightedCodes !== null && normalizedHighlightedCodes.size > 0;

  /** Pattern images added to the map, so they are only created once each. */
  const patternsRef = useRef<Set<string>>(new Set());
  /** Codes that currently carry state, so stale ones can be cleared. */
  const appliedRef = useRef<Map<string, CodeState>>(new Map());
  const hoveredIdRef = useRef<string | null>(null);
  /**
   * Bumped whenever the basemap style is replaced. setStyle drops sources,
   * layers, images and every feature-state along with them, so the effects
   * below have to run again even though none of their inputs changed.
   */
  const [styleEpoch, setStyleEpoch] = useState(0);

  // ---------------------------------------------------------------- sources

  const installStyle = useStableCallback(() => {
    if (!map) {
      return;
    }

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: "vector",
        // Concatenated rather than run through URL(), which percent-encodes the
        // {z}/{x}/{y} placeholders and leaves MapLibre asking for a literal
        // "%7Bz%7D" path.
        tiles: [`${window.location.origin}${tileUrl}`],
        // The tiles carry one composite "DE:01067" property; promoting it to
        // the feature id is what lets feature-state address a postal code.
        promoteId: { [SOURCE_LAYER]: "key" },
        minzoom: 0,
        // The tile route stops at z12; MapLibre overzooms the deepest tile it
        // has rather than requesting one that does not exist.
        maxzoom: 12,
      });
    }

    if (statesData && !map.getSource(STATES_SOURCE_ID)) {
      map.addSource(STATES_SOURCE_ID, {
        type: "geojson",
        data: statesData,
      } as GeoJSONSourceSpecification);
    }
    if (countryShapesData && !map.getSource(COUNTRIES_SOURCE_ID)) {
      map.addSource(COUNTRIES_SOURCE_ID, {
        type: "geojson",
        data: countryShapesData,
      } as GeoJSONSourceSpecification);
    }

    const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
    // Every layer costs bucket-building work on each tile as it arrives, even
    // when none of its features are visible — measured at roughly three times
    // as many long frames when the stripe, duplicate-outline, preview and
    // conflict layers were all present on an area that uses none of them. They
    // are added only while something needs them.
    const add = (
      spec: Parameters<MapLibreMap["addLayer"]>[0],
      needed = true
    ) => {
      const existing = map.getLayer(spec.id);
      if (needed && !existing) {
        map.addLayer(spec, before);
      } else if (!needed && existing) {
        map.removeLayer(spec.id);
      }
    };

    if (map.getSource(STATES_SOURCE_ID)) {
      add({
        id: "pc-states-fill",
        type: "fill",
        source: STATES_SOURCE_ID,
        paint: {
          "fill-color": matchColor("name", STATE_FILL_COLORS, DEFAULT_STATE_FILL),
        },
      });
      add({
        id: "pc-states-line",
        type: "line",
        source: STATES_SOURCE_ID,
        paint: {
          "line-color": matchColor(
            "name",
            STATE_LINE_COLORS,
            DEFAULT_STATE_LINE
          ),
          "line-width": 2,
        },
      });
    }

    // One fill layer covers the base tint and every overlay that only changes
    // a code's colour — a code is in exactly one of unassigned,
    // inactive-country, single-layer or multi-layer, so they cannot collide.
    add({
      id: "pc-fill",
      type: "fill",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: { "fill-color": stateColor("fill", "rgba(98,125,152,0.098)") },
    });

    add({
      id: "pc-line",
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": stateColor("line", "rgba(37,99,235,0.051)"),
        "line-width": stateNumber("lw", 1),
      },
    });

    // Duplicate outlines — one stroke per contributing layer colour, thinner
    // and fainter each time, which reads as an alternating dashed border.
    add({
      id: "pc-dup1",
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": stateColor("l1", "rgba(0,0,0,0)"),
        "line-width": 2.5,
      },
    }, needsDupRef.current);
    add({
      id: "pc-dup2",
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": stateColor("l2", "rgba(0,0,0,0)"),
        "line-width": 1.5,
      },
    }, needsDupRef.current);
    add({
      id: "pc-dup3",
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      layout: { "line-cap": "butt", "line-join": "bevel" },
      paint: {
        "line-color": stateColor("l3", "rgba(0,0,0,0)"),
        "line-width": 0.8,
      },
    }, needsDup3Ref.current);

    add({
      id: "pc-preview-fill",
      type: "fill",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: { "fill-color": stateFlagColor("preview", "rgba(37,99,235,0.314)") },
    }, needsPreviewRef.current);
    add({
      id: "pc-preview-line",
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": stateFlagColor("preview", "rgba(37,99,235,0.784)"),
        "line-width": 2,
      },
    }, needsPreviewRef.current);

    add({
      id: "pc-conflict-fill",
      type: "fill",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: {
        "fill-color": stateFlagColor("conflict", "rgba(255,165,0,0.196)"),
      },
    }, needsConflictRef.current);
    add({
      id: "pc-conflict-line",
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": stateFlagColor("conflict", "rgba(255,165,0,1)"),
        "line-width": 3,
      },
    }, needsConflictRef.current);

    add({
      id: "pc-hover-line",
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          "rgba(255,255,255,0.902)",
          "rgba(0,0,0,0)",
        ] as unknown as ExpressionSpecification,
        "line-width": 2,
      },
    });

    if (map.getSource(COUNTRIES_SOURCE_ID)) {
      add({
        id: "pc-countries-line",
        type: "line",
        source: COUNTRIES_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": matchColor(
            "country",
            COUNTRY_BORDER_COLORS,
            DEFAULT_COUNTRY_BORDER_COLOR
          ),
          "line-width": 5,
        },
      });
    }
  });

  // Install once the map is ready, and again whenever the style underneath us is
  // replaced — setStyle drops every source, layer, image and feature-state we
  // added. That happens on a basemap switch, and also when react-map-gl reuses
  // a recycled map, which re-applies the style with diffing off.
  useEffect(() => {
    if (!(map && isMapLoaded)) {
      return;
    }
    const ensureInstalled = () => {
      if (map.getSource(SOURCE_ID)) {
        return;
      }
      patternsRef.current.clear();
      stripeFiltersRef.current.clear();
      appliedRef.current.clear();
      hoveredIdRef.current = null;
      installStyle();
      setStyleEpoch((epoch) => epoch + 1);
    };

    installStyle();
    // `styledata` alone is not enough: the style can be swapped between this
    // effect being scheduled and it running, in which case the event has
    // already gone by. `idle` fires once the map has settled, so checking there
    // too means a missed event self-heals instead of leaving a bare basemap.
    map.on("styledata", ensureInstalled);
    map.on("idle", ensureInstalled);
    return () => {
      map.off("styledata", ensureInstalled);
      map.off("idle", ensureInstalled);
    };
  }, [
    map,
    isMapLoaded,
    installStyle,
    // Adds or drops the optional layers as the area starts or stops needing
    // them; installStyle reads the current values through refs.
    multiLayerCodes,
    state.hasThreePlusLayerCodes,
    previewCodes,
    normalizedHighlightedCodes,
  ]);

  // Keep the source URL in step with the granularity/country selection.
  useEffect(() => {
    if (!(map && isMapLoaded)) {
      return;
    }
    const source = map.getSource(SOURCE_ID);
    if (source && "setTiles" in source && typeof source.setTiles === "function") {
      (source as { setTiles: (t: string[]) => void }).setTiles([
        `${window.location.origin}${tileUrl}`,
      ]);
    }
  }, [map, isMapLoaded, tileUrl]);

  // ---------------------------------------------------------- feature state

  /**
   * The paint values every styled code should currently have.
   *
   * Rebuilt whenever the resolved styles or any of the code sets change, then
   * diffed against what is already on the map so only real changes are pushed.
   */
  const desiredState = useMemo(() => {
    const desired = new Map<string, CodeState>();
    const styles = resolvedStylesRef.current;

    const put = (key: string, patch: CodeState) => {
      const existing = desired.get(key);
      if (existing) {
        Object.assign(existing, patch);
      } else {
        desired.set(key, patch);
      }
    };

    for (const key of inactiveCountryCodes) {
      put(key, { fill: "rgba(160,160,160,0.098)", line: "rgba(140,140,140,0.235)", lw: 0.5 });
    }
    if (showUnassigned) {
      for (const key of unassignedCodes) {
        put(key, { fill: "rgba(239,68,68,0.216)", line: "rgba(220,38,38,0.627)", lw: 1.5 });
      }
    }

    for (const key of singleLayerCodeSet) {
      const style = styles.get(key);
      if (!style) continue;
      put(key, {
        fill: rgba(style.fillColor),
        line: rgba(style.lineColor),
        lw: style.lineWidth,
      });
    }

    for (const key of multiLayerCodes) {
      const style = styles.get(key);
      if (!style) continue;
      put(key, {
        // pc-fill paints the primary colour; a stripe layer puts the
        // secondary on top through its pattern (see patternGroups).
        fill: rgba(style.primaryFillColor),
        line: rgba(style.lineColor),
        lw: style.lineWidth,
        l1: style.layerLineColors[0]
          ? rgba([
              style.layerLineColors[0][0],
              style.layerLineColors[0][1],
              style.layerLineColors[0][2],
              200,
            ])
          : undefined,
        l2: style.layerLineColors[1]
          ? rgba([
              style.layerLineColors[1][0],
              style.layerLineColors[1][1],
              style.layerLineColors[1][2],
              110,
            ])
          : undefined,
        l3: style.layerLineColors.length >= 3 ? "rgba(120,120,120,0.353)" : undefined,
      });
    }

    if (previewCodes) {
      for (const key of previewCodes) {
        put(key, { preview: true });
      }
    }
    if (normalizedHighlightedCodes) {
      for (const key of normalizedHighlightedCodes) {
        put(key, { conflict: true });
      }
    }

    return desired;
    // resolvedStylesVersion stands in for the contents of resolvedStylesRef.
  }, [
    resolvedStylesRef,
    resolvedStylesVersion,
    singleLayerCodeSet,
    multiLayerCodes,
    sameColorCodes,
    inactiveCountryCodes,
    unassignedCodes,
    showUnassigned,
    previewCodes,
    normalizedHighlightedCodes,
  ]);

  /**
   * Codes grouped by the stripe pattern they need: pattern name → code keys.
   * The name encodes shape and colour, e.g. "stripe-220-38-38-120".
   */
  const patternGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    const styles = resolvedStylesRef.current;
    for (const key of multiLayerCodes) {
      const style = styles.get(key);
      if (!style) continue;
      const secondary = style.secondaryFillColor;
      const shape = sameColorCodes.has(key) ? "cross" : "stripe";
      const name = `${shape}-${secondary[0]}-${secondary[1]}-${secondary[2]}-${secondary[3]}`;
      const keys = groups.get(name);
      if (keys) {
        keys.push(key);
      } else {
        groups.set(name, [key]);
      }
    }
    return groups;
    // resolvedStylesVersion stands in for the contents of resolvedStylesRef.
  }, [resolvedStylesRef, resolvedStylesVersion, multiLayerCodes, sameColorCodes]);

  /** Filter currently applied to each stripe layer, to skip no-op updates. */
  const stripeFiltersRef = useRef<Map<string, string>>(new Map());

  // One layer per pattern: the pattern image is registered once (MapLibre
  // paints fill-pattern as-is rather than tinting it, so the colour is baked
  // in), the layer paints it, and a filter picks the codes. Changing which codes
  // carry a pattern only touches that layer's filter.
  useEffect(() => {
    if (!(map && isMapLoaded && map.getLayer("pc-line"))) {
      return;
    }
    const filters = stripeFiltersRef.current;

    for (const [name, keys] of patternGroups) {
      if (!(patternsRef.current.has(name) || map.hasImage(name))) {
        const [shape, r, g, b, a] = name.split("-");
        const image = createColoredPatternImage(
          shape === "cross" ? "cross" : "stripe",
          [Number(r), Number(g), Number(b), Number(a)]
        );
        if (!image) continue;
        map.addImage(name, image, { pixelRatio: 2 });
      }
      patternsRef.current.add(name);

      const id = `${STRIPE_LAYER_PREFIX}${name}`;
      const filter: FilterSpecification = [
        "in",
        ["get", "key"],
        ["literal", keys],
      ];
      const signature = keys.join(",");
      if (!map.getLayer(id)) {
        // Above the fills, below every outline.
        map.addLayer(
          {
            id,
            type: "fill",
            source: SOURCE_ID,
            "source-layer": SOURCE_LAYER,
            filter,
            paint: { "fill-pattern": name },
          },
          "pc-line"
        );
        filters.set(id, signature);
      } else if (filters.get(id) !== signature) {
        map.setFilter(id, filter);
        filters.set(id, signature);
      }
    }

    for (const id of [...filters.keys()]) {
      const name = id.slice(STRIPE_LAYER_PREFIX.length);
      if (!patternGroups.has(name)) {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
        filters.delete(id);
      }
    }
  }, [map, isMapLoaded, patternGroups, styleEpoch]);

  // Push only what changed. A colour tweak touches a few hundred values and
  // never re-tessellates, which is the whole reason for using feature-state.
  useEffect(() => {
    if (!(map && isMapLoaded && map.getSource(SOURCE_ID))) {
      return;
    }
    const applied = appliedRef.current;
    const target = { source: SOURCE_ID, sourceLayer: SOURCE_LAYER };

    for (const [id, patch] of desiredState) {
      const previous = applied.get(id);
      if (previous && shallowEqual(previous, patch)) {
        continue;
      }
      if (previous) {
        map.removeFeatureState({ ...target, id });
      }
      map.setFeatureState({ ...target, id }, patch);
    }
    for (const id of applied.keys()) {
      if (!desiredState.has(id)) {
        map.removeFeatureState({ ...target, id });
      }
    }
    appliedRef.current = new Map(desiredState);
  }, [map, isMapLoaded, desiredState, styleEpoch]);

  // ------------------------------------------------------------ interaction

  const handleMove = useStableCallback(
    (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      if (!(map && isCursorMode) || isMapInteractingRef?.current) {
        return;
      }
      const feature = event.features?.[0];
      const canvas = mapCanvasRef.current;
      if (!feature) {
        return;
      }
      const id = feature.id as string | undefined;
      if (id !== undefined && hoveredIdRef.current !== id) {
        if (hoveredIdRef.current !== null) {
          map.setFeatureState(
            { source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id: hoveredIdRef.current },
            { hover: false }
          );
        }
        map.setFeatureState(
          { source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id },
          { hover: true }
        );
        hoveredIdRef.current = id;
        if (canvas) {
          canvas.style.cursor = "pointer";
        }
      }
      const storedCode = compositeKeyToStoredCode(
        String(feature.properties?.key ?? "")
      );
      showTooltip(
        event.point.x,
        event.point.y,
        extractRawCode(storedCode),
        layerMembershipByPostalCode.get(storedCode) ?? []
      );
    }
  );

  const handleLeave = useStableCallback(() => {
    if (!map) {
      return;
    }
    if (hoveredIdRef.current !== null) {
      map.setFeatureState(
        { source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id: hoveredIdRef.current },
        { hover: false }
      );
      hoveredIdRef.current = null;
    }
    hideTooltip();
    const canvas = mapCanvasRef.current;
    if (canvas) {
      canvas.style.cursor = "grab";
    }
  });

  const handleClick = useStableCallback(
    (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
      if (!isCursorMode || !onCodeClick) {
        return;
      }
      const feature = event.features?.[0];
      if (!feature) {
        return;
      }
      onCodeClick(
        compositeKeyToStoredCode(String(feature.properties?.key ?? "")),
        event.point.x,
        event.point.y
      );
    }
  );

  useEffect(() => {
    if (!(map && isMapLoaded)) {
      return;
    }
    map.on("mousemove", "pc-fill", handleMove);
    map.on("mouseleave", "pc-fill", handleLeave);
    map.on("click", "pc-fill", handleClick);
    return () => {
      map.off("mousemove", "pc-fill", handleMove);
      map.off("mouseleave", "pc-fill", handleLeave);
      map.off("click", "pc-fill", handleClick);
    };
  }, [map, isMapLoaded, handleMove, handleLeave, handleClick]);

  // Leaving cursor mode drops the hover highlight; TerraDraw owns the cursor
  // during drawing, so it is left alone here.
  useEffect(() => {
    if (!isCursorMode) {
      handleLeave();
    }
  }, [isCursorMode, handleLeave]);

  // Remove everything this hook added when it goes away, so switching renderer
  // or unmounting the map does not leave orphaned layers behind.
  useEffect(() => {
    return () => {
      if (!map || !map.style) {
        return;
      }
      for (const id of LAYER_IDS) {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      }
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.id.startsWith(STRIPE_LAYER_PREFIX)) {
          map.removeLayer(layer.id);
        }
      }
      for (const id of [SOURCE_ID, STATES_SOURCE_ID, COUNTRIES_SOURCE_ID]) {
        if (map.getSource(id)) {
          map.removeSource(id);
        }
      }
    };
  }, [map]);

  return { unassignedCount, clearHover: handleLeave } as const;
}

function shallowEqual(a: CodeState, b: CodeState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}
