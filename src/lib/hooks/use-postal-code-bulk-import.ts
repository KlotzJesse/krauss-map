import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { toast } from "sonner";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import {
  findPostalCodeMatches,
  parsePostalCodeInput,
} from "@/lib/utils/postal-code-parser";

interface PostalCodeBulkImportProps {
  data: FeatureCollection<Polygon | MultiPolygon>;
  granularity: string;
}

export function usePostalCodeBulkImport({
  data,
  granularity,
}: PostalCodeBulkImportProps) {
  const importPostalCodes = useStableCallback((input: string) => {
    if (!input.trim()) {
      toast.error("Keine PLZ-Eingabe gefunden");
      return { success: false, count: 0 };
    }

    try {
      // Parse the input
      const parsed = parsePostalCodeInput(input);
      const validCodes = parsed.filter((p) => p.isValid);

      if (validCodes.length === 0) {
        toast.error("Keine gültigen PLZ gefunden");
        return { success: false, count: 0 };
      }

      // Find matches based on granularity
      const matches = findPostalCodeMatches(parsed, data, granularity);

      if (matches.length === 0) {
        toast.error("Keine passenden PLZ-Regionen gefunden");
        return { success: false, count: 0 };
      }

      // Extract all matched postal codes
      const allMatches = matches.flatMap((match) => match.matched);
      const uniqueMatches = [...new Set(allMatches)];

      if (uniqueMatches.length === 0) {
        toast.error("Keine PLZ-Regionen gefunden");
        return { success: false, count: 0 };
      }

      // Add success notification
      toast.success(`📍 ${uniqueMatches.length} PLZ-Bereiche hinzugefügt`, {
        duration: 3000,
      });

      return {
        success: true,
        count: uniqueMatches.length,
        matches: uniqueMatches,
      };
    } catch (error) {
      console.error("Error importing postal codes:", error);
      toast.error("Fehler beim Importieren der PLZ");
      return { success: false, count: 0 };
    }
  });

  const validateInput = useStableCallback((input: string) => {
    if (!input.trim()) {
      return { valid: 0, invalid: 0, total: 0 };
    }

    const parsed = parsePostalCodeInput(input);
    const valid = parsed.filter((p) => p.isValid).length;
    const invalid = parsed.filter((p) => !p.isValid).length;

    return {
      valid,
      invalid,
      total: parsed.length,
      parsed,
    };
  });

  const previewMatches = useStableCallback((input: string) => {
    if (!input.trim()) {
      return [];
    }

    const parsed = parsePostalCodeInput(input);
    const matches = findPostalCodeMatches(parsed, data, granularity);

    return matches;
  });

  return {
    importPostalCodes,
    validateInput,
    previewMatches,
  };
}
