import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";

type CountryShapesData = FeatureCollection<Polygon | MultiPolygon>;

const countryShapesCache = new Map<string, CountryShapesData>();
const countryShapesInflight = new Map<string, Promise<CountryShapesData>>();

/**
 * Fetches country shape boundaries for DE/AT/CH. Pass a country code to filter,
 * or omit for all available country shapes.
 * Deduplicates concurrent requests to the same endpoint.
 */
export function useCountryShapesData(
  country?: CountryCode
): CountryShapesData | null {
  const cacheKey = country ?? "ALL";
  const [data, setData] = useState<CountryShapesData | null>(
    countryShapesCache.get(cacheKey) ?? null
  );

  useEffect(() => {
    const cached = countryShapesCache.get(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    const url = country
      ? `/api/countries?country=${country}`
      : "/api/countries";

    const existing = countryShapesInflight.get(cacheKey);
    const promise =
      existing ??
      fetch(url)
        .then((res) => res.json() as Promise<CountryShapesData>)
        .then((json) => {
          countryShapesCache.set(cacheKey, json);
          countryShapesInflight.delete(cacheKey);
          return json;
        })
        .catch((error) => {
          countryShapesInflight.delete(cacheKey);
          throw error;
        });

    if (!existing) countryShapesInflight.set(cacheKey, promise);

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
