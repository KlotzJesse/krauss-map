import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";

type StatesData = FeatureCollection<Polygon | MultiPolygon>;

const statesCache = new Map<string, StatesData>();

/**
 * Fetches state boundary data. Pass a country code to filter, or omit for all DACH states.
 */
export function useStatesData(country?: CountryCode): StatesData | null {
  const cacheKey = country ?? "ALL";
  const [data, setData] = useState<StatesData | null>(
    statesCache.get(cacheKey) ?? null
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cached = statesCache.get(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const url = country ? `/api/states?country=${country}` : "/api/states";
    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: StatesData) => {
        statesCache.set(cacheKey, json);
        setData(json);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          // Network error — silently ignored (user sees no data)
        }
      });

    return () => {
      controller.abort();
    };
  }, [cacheKey, country]);

  return data;
}
