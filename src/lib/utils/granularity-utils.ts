/**
 * Granularity management utilities for postal code operations
 */

export interface GranularityOption {
  value: string;
  label: string;
  level: number;
}

export const GRANULARITY_OPTIONS: GranularityOption[] = [
  { value: "1digit", label: "1-stellig", level: 1 },
  { value: "2digit", label: "2-stellig", level: 2 },
  { value: "3digit", label: "3-stellig", level: 3 },
  { value: "5digit", label: "5-stellig", level: 5 },
];

/**
 * Get granularity level (numeric value for comparison)
 */
export function getGranularityLevel(granularity: string): number {
  return (
    GRANULARITY_OPTIONS.find((opt) => opt.value === granularity)?.level || 1
  );
}

/**
 * Get granularity label for display
 */
export function getGranularityLabel(granularity: string): string {
  return (
    GRANULARITY_OPTIONS.find((opt) => opt.value === granularity)?.label ||
    granularity
  );
}

/**
 * Check if granularity change is compatible (no data loss)
 * Compatible means going to higher granularity (1->2->3->5)
 */
export function isGranularityChangeCompatible(
  currentGranularity: string,
  newGranularity: string
): boolean {
  const currentLevel = getGranularityLevel(currentGranularity);
  const newLevel = getGranularityLevel(newGranularity);
  return newLevel >= currentLevel;
}

/**
 * Check if granularity change would cause data loss
 * Data loss occurs when going to lower granularity
 */
export function wouldGranularityChangeCauseDataLoss(
  currentGranularity: string,
  newGranularity: string,
  hasPostalCodes: boolean = false
): boolean {
  if (!hasPostalCodes) {return false;}
  return !isGranularityChangeCompatible(currentGranularity, newGranularity);
}

/**
 * Convert postal code to specific granularity
 * Example: "12345" with granularity "2digit" becomes "12"
 */
export function convertPostalCodeToGranularity(
  postalCode: string,
  granularity: string
): string {
  if (!postalCode) {return postalCode;}

  const cleanCode = postalCode.replace(/\D/g, "");
  const level = getGranularityLevel(granularity);

  switch (level) {
    case 1: {
      return cleanCode.substring(0, 1);
    }
    case 2: {
      return cleanCode.substring(0, 2);
    }
    case 3: {
      return cleanCode.substring(0, 3);
    }
    case 5:
    default: {
      return cleanCode;
    }
  }
}

/**
 * Check if a postal code from one granularity is compatible with another
 * Example: "1" (1digit) is compatible with "12345" (5digit) because "12345" starts with "1"
 */
export function isPostalCodeCompatible(
  sourceCode: string,
  sourceGranularity: string,
  targetGranularity: string
): boolean {
  const sourceLevel = getGranularityLevel(sourceGranularity);
  const targetLevel = getGranularityLevel(targetGranularity);

  // If target is lower granularity, check if source starts with target
  if (targetLevel < sourceLevel) {
    const targetCode = convertPostalCodeToGranularity(
      sourceCode,
      targetGranularity
    );
    return sourceCode.startsWith(targetCode);
  }

  // If target is higher granularity, they're always compatible
  return true;
}

/**
 * Get granularity change description for user messaging
 */
export function getGranularityChangeDescription(
  currentGranularity: string,
  newGranularity: string,
  postalCodeCount: number = 0
): {
  type: "compatible" | "destructive" | "neutral";
  title: string;
  description: string;
} {
  const currentLabel = getGranularityLabel(currentGranularity);
  const newLabel = getGranularityLabel(newGranularity);

  if (currentGranularity === newGranularity) {
    return {
      type: "neutral",
      title: `Bereits ${currentLabel}`,
      description: "Keine Änderung erforderlich",
    };
  }

  const isCompatible = isGranularityChangeCompatible(
    currentGranularity,
    newGranularity
  );

  if (isCompatible) {
    return {
      type: "compatible",
      title: `Wechsel zu ${newLabel}`,
      description:
        postalCodeCount > 0
          ? `${postalCodeCount} Regionen bleiben kompatibel`
          : "Kompatible Änderung",
    };
  }
  return {
    type: "destructive",
    title: `Wechsel zu ${newLabel}`,
    description:
      postalCodeCount > 0
        ? `⚠️ Würde alle ${postalCodeCount} Regionen löschen`
        : "Niedrigere Granularität",
  };
}
