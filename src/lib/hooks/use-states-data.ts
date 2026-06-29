import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";

type StatesData = FeatureCollection<Polygon | MultiPolygon>;

const statesCache = new Map<string, StatesData>();
const statesInflight = new Map<string, Promise<StatesData>>();

/**
 * Fetches state boundary data. Pass a country code to filter, or omit for all DACH states.
 * Deduplicates concurrent requests to the same endpoint.
 */
export function useStatesData(country?: CountryCode): StatesData | null {
  const cacheKey = country ?? "ALL";
  const [data, setData] = useState<StatesData | null>(
    statesCache.get(cacheKey) ?? null
  );

  useEffect(() => {
    const cached = statesCache.get(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    const url = country ? `/api/states?country=${country}` : "/api/states";

    const existing = statesInflight.get(cacheKey);
    const promise =
      existing ??
      fetch(url)
        .then((res) => res.json() as Promise<StatesData>)
        .then((json) => {
          statesCache.set(cacheKey, json);
          statesInflight.delete(cacheKey);
          return json;
        })
        .catch((error) => {
          statesInflight.delete(cacheKey);
          throw error;
        });

    if (!existing) statesInflight.set(cacheKey, promise);

    promise
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [cacheKey, country]);

  return data;
}
