import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

const EMPTY_FC: FeatureCollection<Polygon | MultiPolygon> = {
  type: "FeatureCollection",
  features: [],
};

const geodataCache = new Map<
  string,
  FeatureCollection<Polygon | MultiPolygon>
>();
const inflightRequests = new Map<
  string,
  Promise<FeatureCollection<Polygon | MultiPolygon>>
>();

/**
 * Client-side hook to fetch postal code geodata from the API route.
 * Unified DACH map: loads all countries' data for the given granularity.
 * Use "native" for full resolution (DE@5digit + AT@4digit + CH@4digit).
 * Deduplicates concurrent requests to the same endpoint.
 */
export function useGeodata(granularity: string): {
  data: FeatureCollection<Polygon | MultiPolygon>;
  isLoading: boolean;
} {
  const cacheKey = `postal-${granularity}`;
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

    setIsLoading(true);
    let cancelled = false;

    const existing = inflightRequests.get(cacheKey);
    const promise =
      existing ??
      fetch(`/api/geodata/${granularity}`)
        .then((res) => {
          if (!res.ok)
            throw new Error(`Failed to fetch geodata: ${res.status}`);
          return res.json() as Promise<
            FeatureCollection<Polygon | MultiPolygon>
          >;
        })
        .then((result) => {
          geodataCache.set(cacheKey, result);
          inflightRequests.delete(cacheKey);
          return result;
        })
        .catch((error) => {
          inflightRequests.delete(cacheKey);
          throw error;
        });

    if (!existing) {
      inflightRequests.set(cacheKey, promise);
    }

    promise
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [granularity, cacheKey]);

  return { data, isLoading };
}
