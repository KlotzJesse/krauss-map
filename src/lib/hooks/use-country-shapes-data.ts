import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";

type CountryShapesData = FeatureCollection<Polygon | MultiPolygon>;

const countryShapesCache = new Map<string, CountryShapesData>();
const countryShapesInflight = new Map<string, Promise<CountryShapesData>>();

const normalizeCountries = (
  country?: CountryCode | readonly CountryCode[]
): CountryCode[] => {
  if (!country) {
    return [];
  }
  const source = Array.isArray(country) ? country : [country];
  return [...new Set(source)];
};

const mergeFeatureCollections = (
  collections: CountryShapesData[]
): FeatureCollection<Polygon | MultiPolygon> => ({
  type: "FeatureCollection",
  features: collections.flatMap((collection) => collection.features),
});

/**
 * Fetches country shape boundaries for DE/AT/CH. Pass a country code to filter,
 * or omit for all available country shapes.
 * Deduplicates concurrent requests to the same endpoint.
 */
export function useCountryShapesData(
  country?: CountryCode | readonly CountryCode[]
): CountryShapesData | null {
  const countries = useMemo(() => normalizeCountries(country), [country]);
  const cacheKey = countries.length > 0 ? countries.join(",") : "ALL";
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
    const urls =
      countries.length > 0
        ? countries.map((countryCode) => `/api/countries?country=${countryCode}`)
        : ["/api/countries"];

    const existing = countryShapesInflight.get(cacheKey);
    const promise =
      existing ??
      (async () => {
        const [primaryUrl, ...secondaryUrls] = urls;
        const primaryRes = await fetch(primaryUrl);
        if (!primaryRes.ok) {
          throw new Error(
            `Failed to fetch country shapes data: ${primaryRes.status}`
          );
        }
        const primaryCollection = (await primaryRes.json()) as CountryShapesData;

        if (secondaryUrls.length > 0) {
          countryShapesCache.set(cacheKey, primaryCollection);
          if (!cancelled) {
            setData(primaryCollection);
          }
        }

        const secondaryResponses = await Promise.all(
          secondaryUrls.map(async (url) => fetch(url))
        );
        for (const res of secondaryResponses) {
          if (!res.ok) {
            throw new Error(
              `Failed to fetch country shapes data: ${res.status}`
            );
          }
        }
        const secondaryCollections = (await Promise.all(
          secondaryResponses.map(async (res) => (await res.json()) as CountryShapesData)
        )) as CountryShapesData[];
        const collections = [primaryCollection, ...secondaryCollections];
        const merged =
          collections.length === 1
            ? collections[0]
            : mergeFeatureCollections(collections);
        countryShapesCache.set(cacheKey, merged);
        countryShapesInflight.delete(cacheKey);
        return merged;
      })().catch((error) => {
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
  }, [cacheKey, countries]);

  return data;
}
