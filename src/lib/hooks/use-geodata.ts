import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";
import { DEFAULT_COUNTRY } from "@/lib/config/countries";

const EMPTY_FC: FeatureCollection<Polygon | MultiPolygon> = {
  type: "FeatureCollection",
  features: [],
};

const geodataCache = new Map<
  string,
  FeatureCollection<Polygon | MultiPolygon>
>();

/**
 * Client-side hook to fetch postal code geodata from the API route.
 * Returns a stable reference to avoid unnecessary re-renders.
 * Caches in-memory across component remounts.
 */
export function useGeodata(
  granularity: string,
  country: CountryCode = DEFAULT_COUNTRY
): {
  data: FeatureCollection<Polygon | MultiPolygon>;
  isLoading: boolean;
} {
  const cacheKey = `postal-${country}-${granularity}`;
  const [data, setData] = useState<FeatureCollection<Polygon | MultiPolygon>>(
    () => geodataCache.get(cacheKey) ?? EMPTY_FC
  );
  const [isLoading, setIsLoading] = useState(() => !geodataCache.has(cacheKey));
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cached = geodataCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/geodata/${granularity}?country=${country}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch geodata: ${res.status}`);
        }
        return res.json() as Promise<FeatureCollection<Polygon | MultiPolygon>>;
      })
      .then((result) => {
        geodataCache.set(cacheKey, result);
        setData(result);
        setIsLoading(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [granularity, country, cacheKey]);

  return { data, isLoading };
}
