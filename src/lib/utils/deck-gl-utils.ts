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
 * Extract postal code from a GeoJSON feature's properties.
 * Handles the various property names used across the dataset.
 */
export function getFeatureCode(
  feature: Feature<Polygon | MultiPolygon>
): string | null {
  const props = feature.properties ?? {};
  const code = props.code ?? props.plz ?? props.PLZ ?? props.postalCode;
  return code ? String(code) : null;
}

/**
 * Empty GeoJSON FeatureCollection constant. Reused across layers to avoid allocations.
 */
export const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection" as const,
  features: [] as Feature[],
};
