import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useState } from "react";

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

/**
 * Client-side hook to fetch postal code geodata from the API route.
 * Two-layer cache: in-memory (tab lifetime) + IndexedDB (cross-session).
 * Deduplicates concurrent requests to the same endpoint.
 */
export function useGeodata(granularity: string): {
  data: FeatureCollection<Polygon | MultiPolygon>;
  isLoading: boolean;
} {
  const cacheKey = `postal-${granularity}`;
  const idbKey = `geo:${granularity}`;

  const [data, setData] = useState<FeatureCollection<Polygon | MultiPolygon>>(
    () => geodataCache.get(cacheKey) ?? EMPTY_FC
  );
  const [isLoading, setIsLoading] = useState(() => !geodataCache.has(cacheKey));

  useEffect(() => {
    const cached = geodataCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const existing = inflightRequests.get(cacheKey);
    const promise =
      existing ??
      (async () => {
        const url = `/api/geodata/${granularity}`;

        // 1. Try IndexedDB — instant for returning users
        const stored = await idbGet<IdbEntry>(idbKey);
        if (stored?.data) {
          geodataCache.set(cacheKey, stored.data);
          // Background-refresh: fetch silently to check for updates
          fetch(url)
            .then(async (res) => {
              if (!res.ok) return;
              const freshVersion =
                res.headers.get("X-Geodata-Version") ??
                res.headers.get("x-geodata-version") ??
                "1";
              if (freshVersion !== stored.version) {
                // Data changed — update cache and re-render
                const fresh = (await res.json()) as FeatureCollection<
                  Polygon | MultiPolygon
                >;
                geodataCache.set(cacheKey, fresh);
                setData(fresh);
                idbSet(idbKey, { version: freshVersion, data: fresh });
              }
            })
            .catch(() => {});
          return stored.data;
        }

        // 2. No IDB entry — fetch normally
        const res = await fetch(url);
        if (!res.ok)
          throw new Error(`Failed to fetch geodata: ${res.status}`);
        const result = (await res.json()) as FeatureCollection<
          Polygon | MultiPolygon
        >;
        const version =
          res.headers.get("X-Geodata-Version") ??
          res.headers.get("x-geodata-version") ??
          "1";
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
        }
      })
      .catch(() => {
        inflightRequests.delete(cacheKey);
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [granularity, cacheKey, idbKey]);

  return { data, isLoading };
}
