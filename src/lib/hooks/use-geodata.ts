import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";

import {
  resolveGranularityForCountry,
  type CountryCode,
} from "@/lib/config/countries";
import { idbGet, idbSet } from "@/lib/utils/idb-geodata";

const EMPTY_FC: FeatureCollection<Polygon | MultiPolygon> = {
  type: "FeatureCollection",
  features: [],
};

// Session-level in-memory cache — avoids IDB reads on granularity switches within a tab
const geodataCache = new Map<
  string,
  FeatureCollection<Polygon | MultiPolygon>
>();
const inflightRequests = new Map<
  string,
  Promise<FeatureCollection<Polygon | MultiPolygon>>
>();

interface IdbEntry {
  version: string;
  data: FeatureCollection<Polygon | MultiPolygon>;
}

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
  collections: FeatureCollection<Polygon | MultiPolygon>[]
): FeatureCollection<Polygon | MultiPolygon> => ({
  type: "FeatureCollection",
  features: collections.flatMap((collection) => collection.features),
});

const buildGeodataUrl = (granularity: string, countryCode: CountryCode): string =>
  `/api/geodata/${resolveGranularityForCountry(granularity, countryCode)}?country=${countryCode}`;

/**
 * Client-side hook to fetch postal code geodata from the API route.
 * Two-layer cache: in-memory (tab lifetime) + IndexedDB (cross-session).
 * Deduplicates concurrent requests to the same endpoint.
 */
export function useGeodata(
  granularity: string,
  country?: CountryCode | readonly CountryCode[]
): {
  data: FeatureCollection<Polygon | MultiPolygon>;
  isLoading: boolean;
  error: string | null;
} {
  const countries = useMemo(() => normalizeCountries(country), [country]);
  const cacheCountry = countries.length > 0 ? countries.join(",") : "ALL";
  const cacheKey = `postal-${granularity}:${cacheCountry}`;
  const idbKey = `geo:${granularity}:${cacheCountry}`;

  const [data, setData] = useState<FeatureCollection<Polygon | MultiPolygon>>(
    () => geodataCache.get(cacheKey) ?? EMPTY_FC
  );
  const [isLoading, setIsLoading] = useState(() => !geodataCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = geodataCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const existing = inflightRequests.get(cacheKey);
    const promise =
      existing ??
      (async () => {
        const urls =
          countries.length > 0
            ? countries.map((countryCode) => buildGeodataUrl(granularity, countryCode))
            : [`/api/geodata/${granularity}`];

        // 1. Try IndexedDB — instant for returning users
        const stored = await idbGet<IdbEntry>(idbKey);
        if (stored?.data) {
          geodataCache.set(cacheKey, stored.data);
          if (urls.length === 1) {
            // Background-refresh only for single-country data to keep the check cheap.
            fetch(urls[0])
              .then(async (res) => {
                if (!res.ok) return;
                const freshVersion =
                  res.headers.get("X-Geodata-Version") ??
                  res.headers.get("x-geodata-version") ??
                  "1";
                if (freshVersion !== stored.version) {
                  const fresh = (await res.json()) as FeatureCollection<
                    Polygon | MultiPolygon
                  >;
                  geodataCache.set(cacheKey, fresh);
                  setData(fresh);
                  idbSet(idbKey, { version: freshVersion, data: fresh });
                }
              })
              .catch((error) => {
                console.error("Background geodata refresh failed:", error);
              });
          }
          return stored.data;
        }

        // 2. No IDB entry — fetch normally
        const [primaryUrl, ...secondaryUrls] = urls;
        const secondaryFetches = secondaryUrls.map((url) => fetch(url));
        const primaryRes = await fetch(primaryUrl);
        if (!primaryRes.ok) {
          throw new Error(`Failed to fetch geodata: ${primaryRes.status}`);
        }
        const primaryCollection = (await primaryRes.json()) as FeatureCollection<
          Polygon | MultiPolygon
        >;
        const primaryVersion =
          primaryRes.headers.get("X-Geodata-Version") ??
          primaryRes.headers.get("x-geodata-version") ??
          "1";

        if (secondaryUrls.length > 0) {
          geodataCache.set(cacheKey, primaryCollection);
          if (!cancelled) {
            setData(primaryCollection);
            setIsLoading(false);
          }
        }

        const secondaryResponses = await Promise.all(secondaryFetches);
        for (const res of secondaryResponses) {
          if (!res.ok) {
            throw new Error(`Failed to fetch geodata: ${res.status}`);
          }
        }
        const secondaryCollections = (await Promise.all(
          secondaryResponses.map(
            async (res) =>
              (await res.json()) as FeatureCollection<Polygon | MultiPolygon>
          )
        )) as FeatureCollection<Polygon | MultiPolygon>[];
        const collections = [primaryCollection, ...secondaryCollections];
        const result =
          collections.length === 1
            ? collections[0]
            : mergeFeatureCollections(collections);
        const version = [
          primaryVersion,
          ...secondaryResponses.map(
            (res) =>
              res.headers.get("X-Geodata-Version") ??
              res.headers.get("x-geodata-version") ??
              "1"
          ),
        ].join("|");
        geodataCache.set(cacheKey, result);
        idbSet(idbKey, { version, data: result });
        return result;
      })();

    if (!existing) {
      inflightRequests.set(cacheKey, promise);
    }

    promise
      .then((result) => {
        inflightRequests.delete(cacheKey);
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
          setError(null);
        }
      })
      .catch((error) => {
        inflightRequests.delete(cacheKey);
        if (!cancelled) {
          console.error("Geodata fetch failed:", error);
          setIsLoading(false);
          setError(
            error instanceof Error ? error.message : "Geodaten konnten nicht geladen werden"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, countries, granularity, idbKey]);

  return { data, isLoading, error };
}
