"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import type { PostalCodeIndex } from "@/lib/hooks/use-postal-code-index";
import type { Layer } from "@/lib/types/area-types";
import { extractRawCode, hexToRgba, resolveFeatureKey } from "@/lib/utils/postal-code-keys";
import { hexColorsAreSimilar } from "@/lib/utils/stripe-pattern";

/**
 * Everything the map knows about postal codes that is not tied to how they are
 * drawn: which codes belong to which layer, the colour each one resolves to,
 * and the hover card.
 *
 * Kept separate from the drawing so that the map layers only have to consume
 * the result, and this stays testable on its own.
 */

type RgbaColor = [number, number, number, number];

export const STATE_FILL_COLORS: Record<string, RgbaColor> = {};
export const STATE_LINE_COLORS: Record<string, RgbaColor> = {};

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

export const DEFAULT_STATE_FILL: RgbaColor = [34, 34, 34, 25];
export const DEFAULT_STATE_LINE: RgbaColor = [34, 34, 34, 255];

export interface ResolvedStyle {
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

export const COUNTRY_BORDER_COLORS: Record<string, [number, number, number, number]> =
  {
    // Germany: deep royal blue — professional, map-quality, clearly German
    DE: [29, 78, 216, 220],
    // Austria: deep crimson — flag-inspired, distinct from DE blue
    AT: [185, 28, 28, 220],
    // Switzerland: emerald green — fully distinct from DE and AT, clean cartographic
    CH: [5, 150, 105, 220],
  };
export const DEFAULT_COUNTRY_BORDER_COLOR: [number, number, number, number] = [
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
  featureIndex?: ReadonlyMap<string, unknown>
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
 * Hover-card metadata (place, Bundesland, population, area), fetched the first
 * time someone hovers a polygon rather than with the map, and cached for the
 * page's lifetime. Kept out of the geometry payload because the geometry loads
 * on every visit while this is only needed on hover.
 */
type PostalMetaEntry = [
  string | null,
  number | null,
  number | null,
  number | null,
];
interface PostalMeta {
  states: string[];
  entries: Record<string, PostalMetaEntry>;
}

const metaCache = new Map<string, PostalMeta>();
const metaInflight = new Map<string, Promise<PostalMeta | null>>();
/** Called once the dataset arrives, so a card already on screen fills in
 *  instead of waiting for the pointer to move to another polygon. */
const metaListeners = new Set<() => void>();

function loadPostalMeta(
  granularity: string,
  country: string
): PostalMeta | null {
  const key = `${country}:${granularity}`;
  const cached = metaCache.get(key);
  if (cached) {
    return cached;
  }
  if (!metaInflight.has(key)) {
    metaInflight.set(
      key,
      fetch(`/api/postal-codes/meta/${granularity}?country=${country}`)
        .then((r) => (r.ok ? (r.json() as Promise<PostalMeta>) : null))
        .then((d) => {
          if (d) {
            metaCache.set(key, d);
            for (const listener of metaListeners) {
              listener();
            }
          }
          return d;
        })
        .catch(() => null)
    );
  }
  // First hover renders without metadata; the next one has it.
  return null;
}



export interface UsePostalStyleStateProps {
  index: PostalCodeIndex;
  layers?: Layer[];
  activeLayerId?: number | null;
  previewPostalCode?: string | null;
  /** Country code for the area — used to prefix raw postal codes for DACH matching. */
  country?: string;
  /** Granularity of the loaded dataset — selects the matching hover metadata. */
  granularity?: string;
  /** Composite postal codes (e.g. "DE:12345") to highlight on the map. */
  highlightedCodes?: Set<string> | null;
  /** When true, the codes not assigned to any layer are collected for the overlay. */
  showUnassigned?: boolean;
  /** Ref to the tooltip element — written directly to avoid re-renders on hover. */
  hoverTooltipRef?: RefObject<HTMLDivElement | null>;
}

export function usePostalStyleState({
  index,
  layers,
  activeLayerId,
  previewPostalCode,
  country,
  granularity,
  highlightedCodes,
  showUnassigned = false,
  hoverTooltipRef,
}: UsePostalStyleStateProps) {
  // Resolve per-postal-code styles from all area layers (keyed by country:code).
  // resolvedStyles is stored in a ref so that style-only changes (color, opacity,
  // active layer) don't cascade into the map layers rebuilding their
  // work. Consumers watch resolvedStylesVersion instead and read the ref.
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

  // First-render sync seed — populates the refs immediately so the map has
  // styles before the worker responds. Also the SSR/no-Worker fallback.
  const initialResult = useMemo(() => {
    const result = buildResolvedStyleMap(layers, activeLayerId, country, index.pos);
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
    const featureIndexKeys = index.keys.length > 0
      ? index.keys
      : ([] as string[]);

    // Apply a synchronous style pass first so add/remove interactions paint instantly.
    const syncResult = buildResolvedStyleMap(
      layers,
      activeLayerId,
      country,
      index.pos
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
  }, [layers, activeLayerId, country, index, stabilizeSets]);

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
        codes.add(resolveFeatureKey(pc.postalCode, country, index.pos));
      }
    }
    const prev = prevResolvedCodeSetRef.current;
    if (prev.size === codes.size && [...codes].every((c) => prev.has(c))) {
      return prev;
    }
    prevResolvedCodeSetRef.current = codes;
    return codes;
  }, [layers, country, index]);

  // All assigned codes (across all layers, regardless of visibility) — used for unassigned overlay.
  const prevAllAssignedRef = useRef<Set<string>>(new Set());
  const allAssignedCodeSet = useMemo(() => {
    const codes = new Set<string>();
    if (!layers) return codes;
    for (const layer of layers) {
      for (const pc of layer.postalCodes ?? []) {
        codes.add(resolveFeatureKey(pc.postalCode, country, index.pos));
      }
    }
    const prev = prevAllAssignedRef.current;
    if (prev.size === codes.size && [...codes].every((c) => prev.has(c))) {
      return prev;
    }
    prevAllAssignedRef.current = codes;
    return codes;
  }, [layers, country, index]);

  // Countries that have at least one assigned code (extracted from composite "CC:code" keys).
  const countriesInUse = useMemo(() => {
    const used = new Set<string>();
    for (const key of allAssignedCodeSet) {
      const c = key.split(":")[0];
      if (c && c.length === 2) used.add(c);
    }
    return used;
  }, [allAssignedCodeSet]);

  // Composite keys whose country is not represented in any layer.
  const inactiveCountryCodes = useMemo(() => {
    if (countriesInUse.size === 0) return new Set<string>();
    const inactive = new Set<string>();
    for (const code of index.keys) {
      const c = code.split(":")[0];
      if (c && !countriesInUse.has(c)) inactive.add(code);
    }
    return inactive;
  }, [countriesInUse, index]);

  // Codes not assigned to any layer, excluding codes from inactive countries.
  const unassignedCodes = useMemo(() => {
    if (!showUnassigned) return new Set<string>();
    const codes = new Set<string>();
    for (const code of index.keys) {
      if (!allAssignedCodeSet.has(code) && !inactiveCountryCodes.has(code))
        codes.add(code);
    }
    return codes;
  }, [showUnassigned, index, allAssignedCodeSet, inactiveCountryCodes]);

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

  const hasMultiLayerCodes = multiLayerCodes.size > 0;
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

  // Preview code — resolved to the canonical composite key so the tile filter
  // can match it. Falls back to searching the DACH prefixes for a raw code.
  const previewCodes = useMemo(() => {
    if (!previewPostalCode) {
      return null;
    }
    const previewKey = resolveFeatureKey(previewPostalCode, country, index.pos);
    if (index.pos.has(previewKey)) {
      return new Set([previewKey]);
    }
    const rawCode = extractRawCode(previewPostalCode);
    for (const cc of ["DE", "AT", "CH"]) {
      const key = `${cc}:${rawCode}`;
      if (index.pos.has(key)) {
        return new Set([key]);
      }
    }
    return null;
  }, [previewPostalCode, index, country]);

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

  const lastTooltipArgsRef = useRef<
    [number, number, string, Array<{ name: string; color: string }>] | null
  >(null);

  const showTooltip = useCallback(
    (
      x: number,
      y: number,
      code: string,
      matchingLayers: Array<{ name: string; color: string }>
    ) => {
      const tooltipEl = effectiveTooltipRef.current;
      if (!tooltipEl) return;
      lastTooltipArgsRef.current = [x, y, code, matchingLayers];
      tooltipEl.style.left = `${x + 12}px`;
      tooltipEl.style.top = `${y - 10}px`;
      tooltipEl.style.display = "block";
      const meta = granularity
        ? loadPostalMeta(granularity, country ?? "DE")
        : null;
      const layersKey =
        matchingLayers.map((layer) => `${layer.name}:${layer.color}`).join("|") +
        // Metadata arrives after the first hover; without it in the key the
        // early return below would keep showing the un-enriched card.
        (meta ? "|meta" : "");
      if (
        lastTooltipCodeRef.current === code &&
        lastTooltipLayersKeyRef.current === layersKey
      ) {
        return;
      }
      // Place, Bundesland, population and area come from a dataset fetched on
      // first hover; until it lands these rows simply stay hidden.
      const entry = meta?.entries[code];
      const placeEl = tooltipEl.querySelector<HTMLElement>(
        "[data-tooltip-place]"
      );
      const stateEl = tooltipEl.querySelector<HTMLElement>(
        "[data-tooltip-state]"
      );
      const statsEl = tooltipEl.querySelector<HTMLElement>(
        "[data-tooltip-stats]"
      );
      if (placeEl) {
        placeEl.textContent = entry?.[0] ?? "";
      }
      if (stateEl) {
        const stateName =
          entry?.[3] != null ? (meta?.states[entry[3]] ?? null) : null;
        stateEl.textContent = stateName ?? "";
        stateEl.style.display = stateName ? "block" : "none";
      }
      if (statsEl) {
        const bits: string[] = [];
        if (entry?.[1] != null) {
          bits.push(`${entry[1].toLocaleString("de-DE")} Einw.`);
        }
        if (entry?.[2] != null) {
          bits.push(`${entry[2].toLocaleString("de-DE")} km²`);
        }
        statsEl.textContent = bits.join(" · ");
        statsEl.style.display = bits.length > 0 ? "block" : "none";
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
    [granularity, country]
  );

  const hideTooltip = useCallback(() => {
    const tooltipEl = effectiveTooltipRef.current;
    if (tooltipEl) tooltipEl.style.display = "none";
    lastTooltipCodeRef.current = null;
    lastTooltipLayersKeyRef.current = "";
    // effectiveTooltipRef is a stable ref object — intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warm the hover metadata once the map knows its dataset, so the first card
  // is already complete. Deferred to idle so it never competes with the
  // geometry fetch or the initial render.
  useEffect(() => {
    if (!granularity) {
      return;
    }
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const warm = () => loadPostalMeta(granularity, country ?? "DE");
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(id);
  }, [granularity, country]);

  // The first hover renders before the metadata request resolves. Redraw that
  // card when it lands rather than making the user move the pointer again.
  useEffect(() => {
    const redraw = () => {
      const args = lastTooltipArgsRef.current;
      const el = effectiveTooltipRef.current;
      if (args && el && el.style.display !== "none") {
        showTooltip(...args);
      }
    };
    metaListeners.add(redraw);
    return () => {
      metaListeners.delete(redraw);
    };
  }, [showTooltip, effectiveTooltipRef]);


// Conflict-highlight feature collection (memoized on codes + data)
  const normalizedHighlightedCodes = useMemo(() => {
    if (!highlightedCodes || highlightedCodes.size === 0) {
      return null;
    }
    const normalized = new Set<string>();
    for (const code of highlightedCodes) {
      normalized.add(resolveFeatureKey(code, country, index.pos));
    }
    return normalized;
  }, [highlightedCodes, country, index]);

  /** Codes not assigned to any layer, excluding inactive-country codes. */
  const unassignedCount = useMemo(() => {
    if (countriesInUse.size === 0) return 0;
    let count = 0;
    for (const code of index.keys) {
      if (!allAssignedCodeSet.has(code) && !inactiveCountryCodes.has(code))
        count++;
    }
    return count;
  }, [index, allAssignedCodeSet, inactiveCountryCodes, countriesInUse]);

  return {
    resolvedStylesRef,
    resolvedStylesVersion,
    multiLayerCodes,
    sameColorCodes,
    singleLayerCodeSet,
    allAssignedCodeSet,
    countriesInUse,
    inactiveCountryCodes,
    unassignedCodes,
    unassignedCount,
    hasMultiLayerCodes,
    hasThreePlusLayerCodes,
    previewCodes,
    normalizedHighlightedCodes,
    layerMembershipByPostalCode,
    effectiveTooltipRef,
    showTooltip,
    hideTooltip,
  } as const;
}
