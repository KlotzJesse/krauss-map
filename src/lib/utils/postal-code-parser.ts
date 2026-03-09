import type {
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";

export interface ParsedPostalCode {
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
 * Normalizes a postal code by removing country prefixes and formatting
 */
export function normalizePostalCode(input: string): string {
  return input
    .trim()
    .replace(/^D-?/i, "") // Remove German country prefix
    .replace(/\s+/g, "") // Remove spaces
    .toUpperCase();
}

/**
 * Validates if a string could be a German postal code
 */
export function isValidGermanPostalCode(code: string): boolean {
  const normalized = normalizePostalCode(code);
  // German postal codes are 1-5 digits (for different granularities)
  return /^\d{1,5}$/.test(normalized);
}

/**
 * Parses various input formats for postal codes
 */
export function parsePostalCodeInput(input: string): ParsedPostalCode[] {
  if (!input.trim()) {return [];}

  const results: ParsedPostalCode[] = [];

  // Split by common delimiters: newlines, commas, semicolons, spaces
  const codes = input
    .split(/[,;\n\r\s]+/)
    .map((code) => code.trim())
    .filter((code) => code.length > 0);

  for (const original of codes) {
    const normalized = normalizePostalCode(original);
    const countryMatch = original.match(/^([A-Z]{1,2})-?/i);

    results.push({
      original,
      normalized,
      countryCode: countryMatch?.[1]?.toUpperCase(),
      isValid: isValidGermanPostalCode(original),
      error: !isValidGermanPostalCode(original)
        ? `"${original}" ist keine gültige deutsche PLZ`
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

  // Get all available postal codes from the data
  const allCodes = availableData.features
    .map((f) => f.properties?.code || f.properties?.PLZ || f.properties?.plz)
    .filter((code): code is string => Boolean(code))
    .map((code) => normalizePostalCode(code));

  for (const parsed of parsedCodes) {
    if (!parsed.isValid) {continue;}

    const inputCode = parsed.normalized;
    const matchedCodes: string[] = [];

    // Exact match first
    if (allCodes.includes(inputCode)) {
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
 * Parses CSV content and extracts postal codes
 */
export function parseCSVPostalCodes(csvContent: string): string[] {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());
  const codes: string[] = [];

  for (const line of lines) {
    // Try to parse as CSV (split by comma, semicolon, or tab)
    const fields = line
      .split(/[,;\t]/)
      .map((field) => field.trim().replace(/"/g, ""));

    for (const field of fields) {
      if (isValidGermanPostalCode(field)) {
        codes.push(field);
      }
    }
  }

  return codes;
}

/**
 * Estimates the granularity level from a postal code
 */
export function estimateGranularity(code: string): string {
  const normalized = normalizePostalCode(code);
  const length = normalized.length;

  switch (length) {
    case 1: {
      return "1digit";
    }
    case 2: {
      return "2digit";
    }
    case 3: {
      return "3digit";
    }
    case 5: {
      return "5digit";
    }
    default: {
      return "5digit";
    }
  }
}

/**
 * Groups postal code matches by their input pattern
 */
export function groupMatchesByPattern(
  matches: PostalCodeMatch[]
): Record<string, PostalCodeMatch> {
  return matches.reduce< Record<string, PostalCodeMatch>>(
    (acc, match) => {
      acc[match.code] = match;
      return acc;
    },
    {}
  );
}

/**
 * City and state name mappings for better German/English search support
 */
const CITY_NAME_MAPPINGS = {
  // Major German cities with common English/alternative names
  berlin: ["berlin", "hauptstadt"],
  münchen: ["munich", "muenchen", "münchen"],
  hamburg: ["hamburg", "hansestadt"],
  köln: ["cologne", "koeln", "köln"],
  frankfurt: ["frankfurt", "frankfurt am main", "frankfurt a.m."],
  stuttgart: ["stuttgart"],
  düsseldorf: ["dusseldorf", "duesseldorf", "düsseldorf"],
  dortmund: ["dortmund"],
  essen: ["essen"],
  leipzig: ["leipzig"],
  bremen: ["bremen", "hansestadt bremen"],
  dresden: ["dresden"],
  hannover: ["hanover", "hannover"],
  nürnberg: ["nuremberg", "nuernberg", "nürnberg"],
  duisburg: ["duisburg"],
  bochum: ["bochum"],
  wuppertal: ["wuppertal"],
  bielefeld: ["bielefeld"],
  bonn: ["bonn"],
  münster: ["muenster", "münster"],
  ingolstadt: ["ingolstadt"],
  augsburg: ["augsburg"],
  regensburg: ["regensburg"],
  würzburg: ["wuerzburg", "würzburg"],
  erlangen: ["erlangen"],
  fürth: ["fuerth", "fürth"],
  bamberg: ["bamberg"],
  bayreuth: ["bayreuth"],
  passau: ["passau"],
  landshut: ["landshut"],
  ulm: ["ulm"],
  heilbronn: ["heilbronn"],
  karlsruhe: ["karlsruhe"],
  mannheim: ["mannheim"],
  heidelberg: ["heidelberg"],
  freiburg: ["freiburg"],
  konstanz: ["constance", "konstanz"],
  rostock: ["rostock"],
  schwerin: ["schwerin"],
  kiel: ["kiel"],
  lübeck: ["luebeck", "lübeck"],
  magdeburg: ["magdeburg"],
  halle: ["halle"],
  chemnitz: ["chemnitz"],
  zwickau: ["zwickau"],
  göttingen: ["goettingen", "göttingen"],
  braunschweig: ["brunswick", "braunschweig"],
  oldenburg: ["oldenburg"],
  osnabrück: ["osnabrueck", "osnabrück"],
  mainz: ["mainz"],
  wiesbaden: ["wiesbaden"],
  kassel: ["kassel"],
  darmstadt: ["darmstadt"],
  offenbach: ["offenbach"],
  saarbrücken: ["saarbruecken", "saarbrücken"],
  erfurt: ["erfurt"],
  jena: ["jena"],
  weimar: ["weimar"],
  gera: ["gera"],
  potsdam: ["potsdam"],
  cottbus: ["cottbus"],
  brandenburg: ["brandenburg"],
};

const STATE_NAME_MAPPINGS = {
  // German states with common English/alternative names
  "baden-württemberg": [
    "baden-württemberg",
    "baden-wuerttemberg",
    "baden württemberg",
    "bw",
  ],
  bayern: ["bavaria", "bayern", "by"],
  berlin: ["berlin", "be"],
  brandenburg: ["brandenburg", "bb"],
  bremen: ["bremen", "hb"],
  hamburg: ["hamburg", "hh"],
  hessen: ["hesse", "hessen", "he"],
  "mecklenburg-vorpommern": [
    "mecklenburg-vorpommern",
    "mecklenburg vorpommern",
    "mv",
  ],
  niedersachsen: ["lower saxony", "niedersachsen", "ni"],
  "nordrhein-westfalen": [
    "north rhine-westphalia",
    "nordrhein-westfalen",
    "nordrhein westfalen",
    "nrw",
    "nw",
  ],
  "rheinland-pfalz": [
    "rhineland-palatinate",
    "rheinland-pfalz",
    "rheinland pfalz",
    "rp",
  ],
  saarland: ["saarland", "sl"],
  sachsen: ["saxony", "sachsen", "sn"],
  "sachsen-anhalt": ["saxony-anhalt", "sachsen-anhalt", "sachsen anhalt", "st"],
  "schleswig-holstein": ["schleswig-holstein", "schleswig holstein", "sh"],
  thüringen: ["thuringia", "thueringen", "thüringen", "th"],
};

/**
 * Normalizes city/state names for better search matching
 */
export function normalizeCityStateName(input: string): string[] {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[äöüß]/g, (char) => {
      const map: Record<string, string> = {
        ä: "ae",
        ö: "oe",
        ü: "ue",
        ß: "ss",
      };
      return map[char] || char;
    });

  const variants = [normalized];

  // Check city mappings - exact match or word boundary match
  for (const [germanName, aliases] of Object.entries(CITY_NAME_MAPPINGS)) {
    // Check if input exactly matches any alias or the German name
    if (germanName === normalized || aliases.includes(normalized)) {
      variants.push(germanName, ...aliases);
      break; // Found exact match, no need to continue
    }

    // Check if input is part of a compound city name
    for (const alias of aliases) {
      if (alias.includes(" ") && alias.includes(normalized)) {
        const words = alias.split(" ");
        if (words.includes(normalized)) {
          variants.push(germanName, ...aliases);
          break;
        }
      }
    }
  }

  // Check state mappings - exact match only
  for (const [germanName, aliases] of Object.entries(STATE_NAME_MAPPINGS)) {
    if (germanName === normalized || aliases.includes(normalized)) {
      variants.push(germanName, ...aliases);
      break; // Found exact match, no need to continue
    }
  }

  return [...new Set(variants)];
}

/**
 * Enhanced search query builder for Nominatim that handles German/English terms
 */
export function buildSearchQuery(input: string): string[] {
  const queries = [];
  const normalizedInput = input.trim();

  // Original query
  queries.push(normalizedInput);

  // Try to detect if this could be a city/state name and add variants
  const variants = normalizeCityStateName(normalizedInput);
  queries.push(...variants.filter((v) => v !== normalizedInput.toLowerCase()));

  // Add "Germany" context for better results
  if (
    !normalizedInput.toLowerCase().includes("deutschland") &&
    !normalizedInput.toLowerCase().includes("germany")
  ) {
    queries.push(`${normalizedInput}, Deutschland`);
    queries.push(`${normalizedInput}, Germany`);
  }

  return [...new Set(queries)];
}

/**
 * Finds postal codes by city or state name using available data
 */
export function findPostalCodesByLocation(
  locationName: string,
  availableData: FeatureCollection<Polygon | MultiPolygon>
): string[] {
  const searchVariants = normalizeCityStateName(locationName);
  const foundCodes: string[] = [];

  for (const feature of availableData.features) {
    const properties = feature.properties || {};

    // Check various property fields that might contain location names
    const propertyValues = [
      properties.name,
      properties.city,
      properties.stadt,
      properties.state,
      properties.bundesland,
      properties.region,
      properties.ort,
      properties.gemeinde,
    ]
      .filter(Boolean)
      .map((v) => v.toString().toLowerCase());

    // Check if any of our search variants match any property values
    const hasMatch = searchVariants.some((variant) =>
      propertyValues.some(
        (prop) => prop.includes(variant) || variant.includes(prop)
      )
    );

    if (hasMatch) {
      const code = properties.code || properties.PLZ || properties.plz;
      if (code) {
        foundCodes.push(normalizePostalCode(code.toString()));
      }
    }
  }

  return [...new Set(foundCodes)];
}

/**
 * Enhanced postal code matching that supports city/state searches
 */
export function findEnhancedPostalCodeMatches(
  input: string,
  availableData: FeatureCollection<Polygon | MultiPolygon>,
  targetGranularity: string
): PostalCodeMatch[] {
  const matches: PostalCodeMatch[] = [];

  // First, try direct postal code parsing
  const parsedCodes = parsePostalCodeInput(input);
  const directMatches = findPostalCodeMatches(
    parsedCodes,
    availableData,
    targetGranularity
  );
  matches.push(...directMatches);

  // If no direct matches or input looks like a location name, try location search
  if (matches.length === 0 || !/^\d/.test(input.trim())) {
    const locationCodes = findPostalCodesByLocation(input, availableData);

    if (locationCodes.length > 0) {
      matches.push({
        code: input.trim(),
        matched: locationCodes,
        granularity: targetGranularity,
      });
    }
  }

  return matches;
}
