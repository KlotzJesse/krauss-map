import type { Geometry } from "geojson";
import { useEffect, useRef, useState } from "react";

export interface LayerOutline {
  layerId: number;
  color: string;
  opacity: number;
  outline: Geometry;
}

const outlineCache = new Map<string, LayerOutline[]>();

/** Stable key derived from visible layers + their postal code counts. */
function buildCacheKey(
  areaId: number,
  layers:
    | { id: number; isVisible: string; postalCodes?: { postalCode: string }[] }[]
    | undefined
): string {
  if (!layers) return `${areaId}-empty`;
  const parts = layers
    .filter((l) => l.isVisible === "true")
    .map((l) => `${l.id}:${(l.postalCodes?.length ?? 0)}`)
    .sort()
    .join(",");
  return `${areaId}-${parts}`;
}

/**
 * Fetches PostGIS-dissolved layer outlines for an area.
 * Each visible layer's postal codes are unioned server-side into a single
 * outer silhouette — no internal borders between postal codes.
 *
 * Fires immediately on key change; any in-flight request for a previous key
 * is aborted via AbortController before the new fetch starts.
 * Results are cached in a module-level Map keyed by areaId + visible layer set.
 */
export function useLayerOutlines(
  areaId: number,
  layers:
    | { id: number; isVisible: string; postalCodes?: { postalCode: string }[] }[]
    | undefined
): { outlines: LayerOutline[]; isLoading: boolean } {
  const cacheKey = buildCacheKey(areaId, layers);

  const [outlines, setOutlines] = useState<LayerOutline[]>(
    () => outlineCache.get(cacheKey) ?? []
  );
  const [isLoading, setIsLoading] = useState(
    () => !outlineCache.has(cacheKey)
  );

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cached = outlineCache.get(cacheKey);
    if (cached) {
      setOutlines(cached);
      setIsLoading(false);
      return;
    }

    // Abort any in-flight request for a previous key before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);

    fetch(`/api/areas/${areaId}/layer-outlines`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<LayerOutline[]>;
      })
      .then((data) => {
        outlineCache.set(cacheKey, data);
        setOutlines(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [cacheKey, areaId]);

  return { outlines, isLoading };
}
