
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
 * Finds matching postal codes based on granularity and input patterns.
 *
 * @param defaultCountry - Fallback country for codes without an explicit prefix.
 *   Pass null/undefined to match across all DACH countries (old behaviour).
 *   Must be set to prevent 4-digit AT/CH codes from prefix-matching German 5-digit codes.
 */
export function findPostalCodeMatches(
  parsedCodes: ParsedPostalCode[],
  availableCodes: readonly string[],
  targetGranularity: string,
  defaultCountry?: string | null
): PostalCodeMatch[] {
  const matches: PostalCodeMatch[] = [];

  // Build country-partitioned sets: Map<COUNTRY_UPPER, Set<normalizedCode>>
  const codesByCountry = new Map<string, Set<string>>();
  const allCodesSet = new Set<string>();

  // availableCodes are composite index keys ("DE:01067").
  for (const key of availableCodes) {
    const colon = key.indexOf(":");
    const country = colon >= 0 ? key.slice(0, colon).toUpperCase() : "";
    const code = normalizePostalCode(colon >= 0 ? key.slice(colon + 1) : key);
    allCodesSet.add(code);
    if (country) {
      let set = codesByCountry.get(country);
      if (!set) {
        set = new Set();
        codesByCountry.set(country, set);
      }
      set.add(code);
    }
  }

  for (const parsed of parsedCodes) {
    if (!parsed.isValid) {
      continue;
    }

    const inputCode = parsed.normalized;
    // Explicit prefix on the input takes priority; fall back to dialog-level default
    const effectiveCountry =
      (parsed.countryCode ?? defaultCountry ?? null)?.toUpperCase() ?? null;

    // Scope search to the resolved country, or fall back to all codes
    const searchSet: Set<string> = effectiveCountry
      ? (codesByCountry.get(effectiveCountry) ?? new Set<string>())
      : allCodesSet;

    const matchedCodes: string[] = [];

    // Exact match first — O(1)
    if (searchSet.has(inputCode)) {
      matchedCodes.push(inputCode);
    } else if (inputCode.length < 5) {
      // Prefix expansion within the same country scope only.
      // Without a country filter, skip prefix expansion for codes ≤4 digits to
      // avoid a 4-digit AT/CH code matching German 5-digit codes.
      if (effectiveCountry !== null) {
        for (const code of searchSet) {
          if (code.startsWith(inputCode)) matchedCodes.push(code);
        }
      }
      // If no country is resolved and the code is short, skip prefix expansion
      // — the caller should set defaultCountry before calling this function.
    }

    if (matchedCodes.length > 0) {
      matches.push({
        code: inputCode,
        matched: [...new Set(matchedCodes)],
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
