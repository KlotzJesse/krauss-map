/**
 * Web Worker: resolve-styles
 *
 * Runs buildResolvedStyleMap off the main thread.
 * Input (postMessage):
 *   - layers: WorkerLayer[]
 *   - activeLayerId: number | null
 *   - country?: string
 *   - featureIndexKeys: string[]   — just the keys of the featureIndex Map
 *
 * Output (onmessage result):
 *   - styleEntries: [string, ResolvedStyle][]
 *   - multiLayerCodes: string[]
 *   - sameColorCodes: string[]
 *   - version: string
 */

// ---------------------------------------------------------------------------
// Pure helper functions (inlined — no DOM deps, no imports)
// ---------------------------------------------------------------------------

type RgbaColor = [number, number, number, number];

function hexToRgba(hex: string, alpha = 1): RgbaColor {
  const h = hex.replace("#", "");
  let r: number;
  let g: number;
  let b: number;
  let a: number = Math.round(alpha * 255);

  if (h.length === 3) {
    r = Number.parseInt(h[0] + h[0], 16);
    g = Number.parseInt(h[1] + h[1], 16);
    b = Number.parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = Number.parseInt(h.slice(0, 2), 16);
    g = Number.parseInt(h.slice(2, 4), 16);
    b = Number.parseInt(h.slice(4, 6), 16);
  } else if (h.length === 8) {
    r = Number.parseInt(h.slice(0, 2), 16);
    g = Number.parseInt(h.slice(2, 4), 16);
    b = Number.parseInt(h.slice(4, 6), 16);
    a = Number.parseInt(h.slice(6, 8), 16);
  } else {
    return [0, 0, 0, a];
  }
  return [r, g, b, a];
}

const PREFIX_TO_COUNTRY: Record<string, string> = {
  D: "DE",
  DE: "DE",
  A: "AT",
  AT: "AT",
  CH: "CH",
};

function storedCodeToCompositeKey(stored: string): string | null {
  const normalizedStored = stored.trim();
  const dashIdx = normalizedStored.indexOf("-");
  if (dashIdx < 0) return null;
  const prefix = normalizedStored.slice(0, dashIdx).toUpperCase();
  const rawCode = normalizedStored.slice(dashIdx + 1).trim();
  const country = PREFIX_TO_COUNTRY[prefix];
  return country ? `${country}:${rawCode}` : null;
}

/**
 * featureIndex is passed as a Set<string> of keys (just for .has() lookups).
 * Mirrors the logic in deck-gl-utils.ts resolveFeatureKey.
 */
function resolveFeatureKey(
  storedOrRawCode: string,
  preferredCountry: string | undefined,
  featureIndexKeys: Set<string> | undefined
): string {
  const compositeFromStored = storedCodeToCompositeKey(storedOrRawCode);
  if (compositeFromStored) {
    return compositeFromStored;
  }

  const rawCode = storedOrRawCode;
  if (!featureIndexKeys) {
    return preferredCountry ? `${preferredCountry}:${rawCode}` : rawCode;
  }
  if (preferredCountry) {
    const key = `${preferredCountry}:${rawCode}`;
    if (featureIndexKeys.has(key)) return key;
  }
  for (const cc of ["DE", "AT", "CH"]) {
    if (cc === preferredCountry) continue;
    const k = `${cc}:${rawCode}`;
    if (featureIndexKeys.has(k)) return k;
  }
  if (featureIndexKeys.has(rawCode)) return rawCode;
  return preferredCountry ? `${preferredCountry}:${rawCode}` : rawCode;
}

function hexColorsAreSimilar(
  hex1: string,
  hex2: string,
  threshold = 50
): boolean {
  const parse = (h: string): [number, number, number] => {
    const clean = h.replace("#", "");
    const n = Number.parseInt(
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean,
      16
    );
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  };
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  return (
    Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) < threshold
  );
}

// ---------------------------------------------------------------------------
// Types (kept in sync with use-deck-layers.ts)
// ---------------------------------------------------------------------------

interface ResolvedStyle {
  fillColor: RgbaColor;
  primaryFillColor: RgbaColor;
  secondaryFillColor: RgbaColor;
  lineColor: RgbaColor;
  lineWidth: number;
  count: number;
  isSameColor: boolean;
  layerLineColors: RgbaColor[];
}

interface StyleAccumulator {
  fillWeighted: RgbaColor;
  lineWeighted: RgbaColor;
  weightSum: number;
  hasActive: boolean;
  count: number;
  layerColors: string[];
  layerFillEntries: { color: RgbaColor; isActive: boolean }[];
}

/** Minimal Layer fields used by buildResolvedStyleMap */
interface WorkerLayer {
  id: number;
  color: string;
  opacity: number;
  isVisible: string;
  postalCodes?: { postalCode: string }[];
}

// ---------------------------------------------------------------------------
// Core logic (copied verbatim from use-deck-layers.ts)
// ---------------------------------------------------------------------------

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
  const avgFill: RgbaColor = [
    Math.round(acc.fillWeighted[0] / weight),
    Math.round(acc.fillWeighted[1] / weight),
    Math.round(acc.fillWeighted[2] / weight),
    Math.round(acc.fillWeighted[3] / weight),
  ];
  const avgLine: RgbaColor = [
    Math.round(acc.lineWeighted[0] / weight),
    Math.round(acc.lineWeighted[1] / weight),
    Math.round(acc.lineWeighted[2] / weight),
    255,
  ];

  let isSameColor = false;
  if (acc.count >= 2 && acc.layerColors.length >= 2) {
    isSameColor = acc.layerColors.every((c) =>
      hexColorsAreSimilar(acc.layerColors[0], c, 60)
    );
  }

  const layerLineColors = acc.layerFillEntries.map((entry) => {
    const [r, g, b] = entry.color;
    return [r, g, b, 255] as RgbaColor;
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

  const primaryEntry =
    acc.layerFillEntries.find((e) => e.isActive) ?? acc.layerFillEntries[0];
  const primaryFillColor: RgbaColor = primaryEntry
    ? primaryEntry.color
    : avgFill;

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

function buildResolvedStyleMap(
  layers: WorkerLayer[] | undefined,
  activeLayerId: number | null | undefined,
  country: string | undefined,
  featureIndexKeys: Set<string> | undefined
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
      const key = resolveFeatureKey(rawCode, country, featureIndexKeys);
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
    if (acc.count <= 1) {
      style.lineWidth = acc.hasActive ? 2.5 : 1.5;
    }
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

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = (
  e: MessageEvent<{
    requestId: number;
    layers: WorkerLayer[] | undefined;
    activeLayerId: number | null;
    country: string | undefined;
    featureIndexKeys: string[];
  }>
) => {
  const { requestId, layers, activeLayerId, country, featureIndexKeys } =
    e.data;

  // Reconstruct a Set<string> from the serialized keys array for .has() lookups
  const featureIndexKeysSet: Set<string> | undefined =
    featureIndexKeys.length > 0 ? new Set(featureIndexKeys) : undefined;

  const result = buildResolvedStyleMap(
    layers,
    activeLayerId,
    country,
    featureIndexKeysSet
  );

  self.postMessage({
    requestId,
    styleEntries: [...result.map.entries()],
    multiLayerCodes: [...result.multiLayerCodes],
    sameColorCodes: [...result.sameColorCodes],
    version: result.version,
  });
};
