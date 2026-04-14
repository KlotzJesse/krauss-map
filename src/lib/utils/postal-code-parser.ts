import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { detectCountryFromCode } from "@/lib/config/countries";

interface ParsedPostalCode {
  original: string;
  normalized: string;
  countryCode?: string;
  isValid: boolean;
  error?: string;
}

export interface PostalCodeMatch {
  code: string;
  matched: string[];
  granularity: string;
}

/**
 * Normalizes a postal code by removing country prefixes and formatting.
 * Supports DE (D-), AT (A-), CH (CH-) prefixes.
 */
export function normalizePostalCode(input: string): string {
  const { code } = detectCountryFromCode(input);
  return code.toUpperCase();
}

/**
 * Validates if a string could be a DACH postal code (1-5 digits).
 */
function isValidPostalCode(code: string): boolean {
  const normalized = normalizePostalCode(code);
  return /^\d{1,5}$/.test(normalized);
}

/**
 * Parses various input formats for postal codes
 */
export function parsePostalCodeInput(input: string): ParsedPostalCode[] {
  if (!input.trim()) {
    return [];
  }

  const results: ParsedPostalCode[] = [];

  // Split by common delimiters: newlines, commas, semicolons, spaces
  const codes = input
    .split(/[,;\n\r\s]+/)
    .map((code) => code.trim())
    .filter((code) => code.length > 0);

  for (const original of codes) {
    const normalized = normalizePostalCode(original);
    const { country } = detectCountryFromCode(original);

    results.push({
      original,
      normalized,
      countryCode: country ?? undefined,
      isValid: isValidPostalCode(original),
      error: !isValidPostalCode(original)
        ? `"${original}" ist keine gültige PLZ`
        : undefined,
    });
  }

  return results;
}

/**
 * Finds matching postal codes based on granularity and input patterns
 */
export function findPostalCodeMatches(
  parsedCodes: ParsedPostalCode[],
  availableData: FeatureCollection<Polygon | MultiPolygon>,
  targetGranularity: string
): PostalCodeMatch[] {
  const matches: PostalCodeMatch[] = [];

  // Build Set for O(1) exact lookups + array for prefix scans
  const allCodes: string[] = [];
  const codeSet = new Set<string>();
  for (const f of availableData.features) {
    const raw = f.properties?.code || f.properties?.PLZ || f.properties?.plz;
    if (raw) {
      const code = normalizePostalCode(raw);
      allCodes.push(code);
      codeSet.add(code);
    }
  }

  for (const parsed of parsedCodes) {
    if (!parsed.isValid) {
      continue;
    }

    const inputCode = parsed.normalized;
    const matchedCodes: string[] = [];

    // Exact match first — O(1) via Set
    if (codeSet.has(inputCode)) {
      matchedCodes.push(inputCode);
    } else {
      // Pattern matching based on granularity and input length
      const inputLength = inputCode.length;

      if (inputLength < 5) {
        // Partial code - find all codes that start with this pattern
        const pattern = inputCode;
        const prefixMatches = allCodes.filter((code) =>
          code.startsWith(pattern)
        );
        matchedCodes.push(...prefixMatches);
      }
    }

    if (matchedCodes.length > 0) {
      matches.push({
        code: inputCode,
        matched: [...new Set(matchedCodes)], // Remove duplicates
        granularity: targetGranularity,
      });
    }
  }

  return matches;
}

/**
 * Groups postal code matches by their input pattern
 */
export function groupMatchesByPattern(
  matches: PostalCodeMatch[]
): Record<string, PostalCodeMatch> {
  return matches.reduce<Record<string, PostalCodeMatch>>((acc, match) => {
    acc[match.code] = match;
    return acc;
  }, {});
}
