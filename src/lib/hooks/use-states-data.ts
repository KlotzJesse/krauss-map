import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";

type StatesData = FeatureCollection<Polygon | MultiPolygon>;

const statesCache = new Map<string, StatesData>();
const statesInflight = new Map<string, Promise<StatesData>>();

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
  collections: StatesData[]
): FeatureCollection<Polygon | MultiPolygon> => ({
  type: "FeatureCollection",
  features: collections.flatMap((collection) => collection.features),
});

/**
 * Fetches state boundary data. Pass a country code to filter, or omit for all DACH states.
 * Deduplicates concurrent requests to the same endpoint.
 */
export function useStatesData(
  country?: CountryCode | readonly CountryCode[]
): StatesData | null {
  const countries = useMemo(() => normalizeCountries(country), [country]);
  const cacheKey = countries.length > 0 ? countries.join(",") : "ALL";
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
    const urls =
      countries.length > 0
        ? countries.map((countryCode) => `/api/states?country=${countryCode}`)
        : ["/api/states"];

    const existing = statesInflight.get(cacheKey);
    const promise =
      existing ??
      (async () => {
        const [primaryUrl, ...secondaryUrls] = urls;
        const primaryRes = await fetch(primaryUrl);
        if (!primaryRes.ok) {
          throw new Error(`Failed to fetch states data: ${primaryRes.status}`);
        }
        const primaryCollection = (await primaryRes.json()) as StatesData;

        if (secondaryUrls.length > 0) {
          statesCache.set(cacheKey, primaryCollection);
          if (!cancelled) {
            setData(primaryCollection);
          }
        }

        const secondaryResponses = await Promise.all(
          secondaryUrls.map(async (url) => fetch(url))
        );
        for (const res of secondaryResponses) {
          if (!res.ok) {
            throw new Error(`Failed to fetch states data: ${res.status}`);
          }
        }
        const secondaryCollections = (await Promise.all(
          secondaryResponses.map(async (res) => (await res.json()) as StatesData)
        )) as StatesData[];
        const collections = [primaryCollection, ...secondaryCollections];
        const merged =
          collections.length === 1
            ? collections[0]
            : mergeFeatureCollections(collections);
        statesCache.set(cacheKey, merged);
        statesInflight.delete(cacheKey);
        return merged;
      })().catch((error) => {
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
  }, [cacheKey, countries]);

  return data;
}
