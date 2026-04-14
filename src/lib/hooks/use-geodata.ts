import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";

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
 * Unified DACH map: omit country to load all countries' data.
 */
export function useGeodata(
  granularity: string,
  country?: CountryCode
): {
  data: FeatureCollection<Polygon | MultiPolygon>;
  isLoading: boolean;
} {
  const cacheKey = `postal-${country ?? "ALL"}-${granularity}`;
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

    const url = country
      ? `/api/geodata/${granularity}?country=${country}`
      : `/api/geodata/${granularity}`;

    fetch(url, { signal: controller.signal })
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
