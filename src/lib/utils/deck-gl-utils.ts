import type { Feature, MultiPolygon, Polygon } from "geojson";

/**
 * Convert a hex color string to an RGBA array for deck.gl.
 * Accepts #RGB, #RRGGBB, or #RRGGBBAA formats.
 */
export function hexToRgba(
  hex: string,
  alpha = 1
): [number, number, number, number] {
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

/**
 * Extract a unique feature identifier from a GeoJSON feature's properties.
 * Returns composite `country:code` when country is available (for DACH deduplication),
 * falls back to raw code string for legacy data.
 */
export function getFeatureCode(
  feature: Feature<Polygon | MultiPolygon>
): string | null {
  const props = feature.properties ?? {};
  const code = props.code ?? props.plz ?? props.PLZ ?? props.postalCode;
  if (!code) {
    return null;
  }
  const country = props.country;
  return country ? `${country}:${code}` : String(code);
}

/**
 * Extract the raw postal code string from a feature (without country prefix).
 * Use this when interacting with DB operations that expect raw codes.
 */
export function getFeatureRawCode(
  feature: Feature<Polygon | MultiPolygon>
): string | null {
  const props = feature.properties ?? {};
  const code = props.code ?? props.plz ?? props.PLZ ?? props.postalCode;
  return code ? String(code) : null;
}

/**
 * Extract the raw code portion from a composite key ("DE:01067" → "01067").
 * Returns the input unchanged if no country prefix is present.
 */
export function rawCodeFromComposite(compositeKey: string): string {
  const colonIdx = compositeKey.indexOf(":");
  return colonIdx >= 0 ? compositeKey.slice(colonIdx + 1) : compositeKey;
}

/**
 * Empty GeoJSON FeatureCollection constant. Reused across layers to avoid allocations.
 */
export const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection" as const,
  features: [] as Feature[],
};
