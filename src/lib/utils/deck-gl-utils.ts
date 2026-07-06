import type { Feature, MultiPolygon, Polygon } from "geojson";

/** Maps ISO country code → stored postal code prefix (e.g. DE → "D"). */
const COUNTRY_TO_PREFIX: Record<string, string> = {
  DE: "D",
  AT: "A",
  CH: "CH",
};
/** Maps stored prefix → ISO country code (e.g. "D" → "DE"). */
const PREFIX_TO_COUNTRY: Record<string, string> = {
  D: "DE",
  DE: "DE",
  A: "AT",
  AT: "AT",
  CH: "CH",
};

/**
 * Convert a stored postal code ("D-12345" / "A-1010" / "CH-3800") to a
 * featureIndex composite key ("DE:12345" / "AT:1010" / "CH:3800").
 * Returns null if the input has no recognised prefix (raw numeric code).
 */
export function storedCodeToCompositeKey(stored: string): string | null {
  const normalizedStored = stored.trim();
  const dashIdx = normalizedStored.indexOf("-");
  if (dashIdx < 0) return null;
  const prefix = normalizedStored.slice(0, dashIdx).toUpperCase();
  const rawCode = normalizedStored.slice(dashIdx + 1).trim();
  const country = PREFIX_TO_COUNTRY[prefix];
  return country ? `${country}:${rawCode}` : null;
}

/**
 * Convert a featureIndex composite key ("DE:12345") to stored format ("D-12345").
 * Returns the input unchanged if no ":" separator is present.
 */
export function compositeKeyToStoredCode(compositeKey: string): string {
  const colonIdx = compositeKey.indexOf(":");
  if (colonIdx < 0) return compositeKey;
  const country = compositeKey.slice(0, colonIdx);
  const code = compositeKey.slice(colonIdx + 1);
  const prefix = COUNTRY_TO_PREFIX[country] ?? country;
  return `${prefix}-${code}`;
}

/**
 * Extract the raw numeric code from any format:
 * - stored "D-12345" → "12345"
 * - composite "DE:12345" → "12345"
 * - raw "12345" → "12345"
 */
export function extractRawCode(code: string): string {
  const colonIdx = code.indexOf(":");
  if (colonIdx >= 0) return code.slice(colonIdx + 1);
  const dashIdx = code.indexOf("-");
  if (dashIdx >= 0) return code.slice(dashIdx + 1);
  return code;
}

/**
 * Get the stored-format postal code from a GeoJSON feature.
 * Returns "D-12345" / "A-1010" / "CH-3800" when country is in properties,
 * falls back to raw code string for legacy features without country.
 */
export function getFeatureStoredCode(
  feature: Feature<Polygon | MultiPolygon>
): string | null {
  const props = feature.properties ?? {};
  const code = props.code ?? props.plz ?? props.PLZ ?? props.postalCode;
  if (!code) return null;
  const rawCode = String(code);
  const country = props.country as string | undefined;
  if (!country) return rawCode;
  const prefix = COUNTRY_TO_PREFIX[country];
  return prefix ? `${prefix}-${rawCode}` : rawCode;
}

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
 * Resolve the composite featureIndex key ("country:code") for a stored or raw postal code.
 *
 * For stored-format codes ("D-12345" / "A-1010" / "CH-3800") the country is known
 * unambiguously — returns the composite key directly without any fallback search.
 *
 * For legacy raw numeric codes, tries the preferred country first, then all other
 * DACH countries, then a raw/legacy key. Falls back to `${preferredCountry}:${rawCode}`
 * when no match is found in the featureIndex.
 */
export function resolveFeatureKey(
  storedOrRawCode: string,
  preferredCountry: string | undefined,
  featureIndex: Map<string, unknown> | undefined
): string {
  // Fast-path: stored format encodes the country — no ambiguity, no fallback needed
  const compositeFromStored = storedCodeToCompositeKey(storedOrRawCode);
  if (compositeFromStored) {
    return compositeFromStored;
  }

  // Legacy: raw numeric code — use fallback search across DACH countries
  const rawCode = storedOrRawCode;
  if (!featureIndex) {
    return preferredCountry ? `${preferredCountry}:${rawCode}` : rawCode;
  }
  if (preferredCountry) {
    const key = `${preferredCountry}:${rawCode}`;
    if (featureIndex.has(key)) return key;
  }
  for (const cc of ["DE", "AT", "CH"]) {
    if (cc === preferredCountry) continue;
    const k = `${cc}:${rawCode}`;
    if (featureIndex.has(k)) return k;
  }
  if (featureIndex.has(rawCode)) return rawCode;
  return preferredCountry ? `${preferredCountry}:${rawCode}` : rawCode;
}

/**
 * Empty GeoJSON FeatureCollection constant. Reused across layers to avoid allocations.
 */
export const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection" as const,
  features: [] as Feature[],
};
