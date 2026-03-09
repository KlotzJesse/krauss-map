import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { Feature } from "maplibre-gl";
import { useState, useMemo } from "react";
import { toast } from "sonner";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";

interface PostalCodeSearchProps {
  data: FeatureCollection<MultiPolygon | Polygon, GeoJsonProperties>;
}

export function usePostalCodeSearch({ data }: PostalCodeSearchProps) {
  const [searchResults, setSearchResults] = useState<string[]>([]);

  const [isSearching, setIsSearching] = useState(false);

  // Pre-build search index for O(1) lookups instead of O(n) filtering

  const searchIndex = useMemo(() => {
    const index = new Map();

    data.features.forEach((feature) => {
      const searchableText = [
        feature.properties?.code,

        feature.properties?.PLZ,

        feature.properties?.plz,

        feature.properties?.name,
      ]

        .filter(Boolean)

        .join(" ")

        .toLowerCase();

      // Index by individual words for partial matching

      const words = searchableText.split(/\s+/);

      words.forEach((word) => {
        if (word.length > 1) {
          // Skip single characters for performance

          if (!index.has(word)) {index.set(word, new Set());}

          index.get(word).add(feature);
        }
      });
    });

    return index;
  }, [data.features]);

  const searchPostalCodes = useStableCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);

      return;
    }

    setIsSearching(true);

    try {
      // Optimized search using pre-built index - O(1) instead of O(n)

      const searchTerms = query.toLowerCase().split(/\s+/);

      const results = new Map();

      searchTerms.forEach((term) => {
        if (searchIndex.has(term)) {
          searchIndex.get(term).forEach((feature: Feature) => {
            const code =
              feature.properties?.code ||
              feature.properties?.PLZ ||
              feature.properties?.plz;

            if (code) {results.set(code, feature);}
          });
        }
      });

      // Convert to array and limit results

      const finalResults = [...results.keys()].slice(0, 10);

      setSearchResults(finalResults);
    } catch (error) {
      console.error("Error searching postal codes:", error);

      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  });

  const selectPostalCode = useStableCallback((postalCode: string) => {
    setSearchResults([]); // Clear search results after selection

    toast.success(`� ${postalCode} gefunden`, {
      duration: 2000,
    });

    return postalCode;
  });

  const clearSearch = useStableCallback(() => {
    setSearchResults([]);

    setIsSearching(false);
  });

  return {
    searchResults,

    isSearching,

    searchPostalCodes,

    selectPostalCode,

    clearSearch,
  };
}
