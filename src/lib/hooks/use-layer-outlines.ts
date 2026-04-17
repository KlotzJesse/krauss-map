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
 * Debounces fetches (300ms) so rapid selection changes don't hammer the API.
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevKeyRef = useRef<string>(cacheKey);

  useEffect(() => {
    if (cacheKey === prevKeyRef.current && outlineCache.has(cacheKey)) {
      return;
    }
    prevKeyRef.current = cacheKey;

    const cached = outlineCache.get(cacheKey);
    if (cached) {
      setOutlines(cached);
      setIsLoading(false);
      return;
    }

    // Debounce: wait for rapid changes to settle before hitting the API
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setIsLoading(true);

    timerRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

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
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [cacheKey, areaId]);

  return { outlines, isLoading };
}
