/**
 * Country configuration for DACH postal code territory management.
 * Adding a new country = adding one entry here + importing geodata.
 */

export type CountryCode = "DE" | "AT" | "CH";

export interface CountryConfig {
  code: CountryCode;
  name: string;
  localName: string;
  flag: string;
  /** ISO postal code prefix (used in export/import) */
  prefix: string;
  /** Number of digits in full postal codes */
  maxDigits: number;
  /** Map center [longitude, latitude] */
  center: [number, number];
  /** Default map zoom level */
  zoom: number;
  /** Valid granularity levels for this country */
  granularityLevels: number[];
  /** Default granularity for new areas */
  defaultGranularity: string;
  /** Nominatim country code for geocoding */
  geocodeCountryCode: string;
  /** Number of admin states/regions */
  stateCount: number;
  /** Label for admin divisions (Bundesland, Kanton, etc.) */
  stateLabel: string;
}

export const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  DE: {
    code: "DE",
    name: "Germany",
    localName: "Deutschland",
    flag: "🇩🇪",
    prefix: "D",
    maxDigits: 5,
    center: [10.4515, 51.1657],
    zoom: 5,
    granularityLevels: [1, 2, 3, 5],
    defaultGranularity: "5digit",
    geocodeCountryCode: "de",
    stateCount: 16,
    stateLabel: "Bundesland",
  },
  AT: {
    code: "AT",
    name: "Austria",
    localName: "Österreich",
    flag: "🇦🇹",
    prefix: "A",
    maxDigits: 4,
    center: [13.3333, 47.5167],
    zoom: 6,
    granularityLevels: [1, 2, 3, 4],
    defaultGranularity: "4digit",
    geocodeCountryCode: "at",
    stateCount: 9,
    stateLabel: "Bundesland",
  },
  CH: {
    code: "CH",
    name: "Switzerland",
    localName: "Schweiz",
    flag: "🇨🇭",
    prefix: "CH",
    maxDigits: 4,
    center: [8.2275, 46.8182],
    zoom: 7,
    granularityLevels: [1, 2, 3, 4],
    defaultGranularity: "4digit",
    geocodeCountryCode: "ch",
    stateCount: 26,
    stateLabel: "Kanton",
  },
} as const;

export const COUNTRY_CODES = Object.keys(COUNTRY_CONFIGS) as CountryCode[];

export const DEFAULT_COUNTRY: CountryCode = "DE";

/**
 * Get country config, falling back to DE for unknown codes.
 */
export function getCountryConfig(code: string): CountryConfig {
  const upper = code.toUpperCase() as CountryCode;
  return COUNTRY_CONFIGS[upper] ?? COUNTRY_CONFIGS.DE;
}

/**
 * Check if a country code is valid.
 */
export function isValidCountryCode(code: string): code is CountryCode {
  return code.toUpperCase() in COUNTRY_CONFIGS;
}

/**
 * Get the granularity value string (e.g., "4digit") for a given level and country.
 */
export function getGranularityValueForLevel(level: number): string {
  return `${level}digit`;
}

/**
 * Get valid granularity options for a country.
 */
export function getGranularityOptionsForCountry(country: CountryCode) {
  const config = getCountryConfig(country);
  return config.granularityLevels.map((level) => ({
    value: `${level}digit`,
    label: `${level}-stellig`,
    level,
  }));
}

/**
 * Get the full-resolution granularity for a country (e.g., "5digit" for DE, "4digit" for AT/CH).
 */
export function getFullGranularity(country: CountryCode): string {
  const config = getCountryConfig(country);
  return `${config.maxDigits}digit`;
}

/**
 * Format a postal code for display/export with leading zeros.
 */
export function formatPostalCodeForCountry(
  code: string,
  country: CountryCode
): string {
  const config = getCountryConfig(country);
  const clean = code.replace(/\D/g, "");
  return clean.padStart(config.maxDigits, "0");
}

/**
 * Format with country prefix (e.g., "D-01067", "A-1010", "CH-8001").
 */
export function formatWithPrefix(code: string, country: CountryCode): string {
  const config = getCountryConfig(country);
  const formatted = formatPostalCodeForCountry(code, country);
  return `${config.prefix}-${formatted}`;
}

/**
 * Detect country from a prefixed postal code string.
 * Returns the country code and the clean numeric code.
 */
export function detectCountryFromCode(input: string): {
  country: CountryCode | null;
  code: string;
} {
  const trimmed = input.trim();

  // Try to match country prefix patterns: D-xxxxx, A-xxxx, CH-xxxx, AT-xxxx
  const prefixMatch = trimmed.match(/^(D|DE|A|AT|CH)-?\s*(\d+)$/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toUpperCase();
    const code = prefixMatch[2];

    if (prefix === "D" || prefix === "DE") return { country: "DE", code };
    if (prefix === "A" || prefix === "AT") return { country: "AT", code };
    if (prefix === "CH") return { country: "CH", code };
  }

  // No prefix — return just the numeric part
  const numericOnly = trimmed.replace(/\D/g, "");
  return { country: null, code: numericOnly };
}

/**
 * DACH-wide geocoding country codes string for Nominatim.
 */
export const DACH_COUNTRY_CODES = "de,at,ch";
