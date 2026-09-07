import {
  type CountryCode,
  detectCountryFromCode,
  formatWithPrefix,
} from "@/lib/config/countries";

/**
 * Postal codes are stored in composite form — "D-86899", "A-1010", "CH-8001" —
 * so that Austrian and Swiss 4-digit codes cannot collide with German ones.
 *
 * Two write paths used to insert whatever the caller passed in, which put 7,003
 * bare codes into two areas and made them invisible to postal-code search.
 * Every path that accepts codes from outside the database normalizes through
 * here, and a CHECK constraint on area_layer_postal_codes.postal_code rejects
 * anything that slips past.
 */
export function normalizePostalCode(
  code: string,
  fallbackCountry: CountryCode
): string | null {
  const detected = detectCountryFromCode(code);
  const country = (detected.country ?? fallbackCountry) as CountryCode;
  const raw = detected.code;
  if (!raw || raw.length < 1 || raw.length > 6) {
    return null;
  }
  return formatWithPrefix(raw, country);
}

/** Normalize a batch, dropping unparseable entries and duplicates. */
export function normalizePostalCodes(
  codes: readonly string[],
  fallbackCountry: CountryCode
): string[] {
  const out = new Set<string>();
  for (const code of codes) {
    const normalized = normalizePostalCode(code, fallbackCountry);
    if (normalized) {
      out.add(normalized);
    }
  }
  return [...out];
}
