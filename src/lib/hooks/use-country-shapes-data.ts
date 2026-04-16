import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";

type CountryShapesData = FeatureCollection<Polygon | MultiPolygon>;

const countryShapesCache = new Map<string, CountryShapesData>();

/**
 * Fetches country shape boundaries for DE/AT/CH. Pass a country code to filter,
 * or omit for all available country shapes.
 */
export function useCountryShapesData(country?: CountryCode): CountryShapesData | null {
  const cacheKey = country ?? "ALL";
  const [data, setData] = useState<CountryShapesData | null>(
    countryShapesCache.get(cacheKey) ?? null
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cached = countryShapesCache.get(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const url = country ? `/api/countries?country=${country}` : "/api/countries";
    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: CountryShapesData) => {
        countryShapesCache.set(cacheKey, json);
        setData(json);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          // Network error — silently ignored (user sees no overlay)
        }
      });

    return () => {
      controller.abort();
    };
  }, [cacheKey, country]);

  return data;
}