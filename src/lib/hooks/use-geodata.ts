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

/**
 * Client-side hook to fetch postal code geodata from the API route.
 * Returns a stable reference to avoid unnecessary re-renders.
 * Caches in-memory across component remounts.
 */
export function useGeodata(granularity: string): {
  data: FeatureCollection<Polygon | MultiPolygon>;
  isLoading: boolean;
} {
  const [data, setData] = useState<FeatureCollection<Polygon | MultiPolygon>>(
    () => geodataCache.get(`postal-${granularity}`) ?? EMPTY_FC
  );
  const [isLoading, setIsLoading] = useState(
    () => !geodataCache.has(`postal-${granularity}`)
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cached = geodataCache.get(`postal-${granularity}`);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/geodata/${granularity}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch geodata: ${res.status}`);
        }
        return res.json() as Promise<FeatureCollection<Polygon | MultiPolygon>>;
      })
      .then((result) => {
        geodataCache.set(`postal-${granularity}`, result);
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
  }, [granularity]);

  return { data, isLoading };
}
