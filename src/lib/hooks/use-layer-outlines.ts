import type { FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

export interface LayerOutline {
  layerId: number;
  color: string;
  opacity: number;
  outline: Geometry;
}

type LayerWithCodes = {
  id: number;
  color: string;
  opacity: number;
  isVisible: string;
  postalCodes?: { postalCode: string }[];
};

const outlineCache = new Map<string, LayerOutline[]>();

/** Stable key from the actual sorted postal codes per visible layer. */
function buildCacheKey(
  areaId: number,
  layers: LayerWithCodes[] | undefined
): string {
  if (!layers?.length) return `${areaId}:empty`;
  const parts = layers
    .filter((l) => l.isVisible === "true" && l.postalCodes?.length)
    .map((l) => {
      const codes = (l.postalCodes ?? [])
        .map((pc) => pc.postalCode)
        .sort()
        .join(",");
      return `${l.id}:${codes}`;
    })
    .sort()
    .join("|");
  return `${areaId}:${parts || "empty"}`;
}

/**
 * Fetches PostGIS-dissolved layer outlines for an area.
 * Each visible layer's postal codes are ST_Union'd server-side into one outer silhouette.
 *
 * - Cache keyed by actual sorted postal codes — exact hits, no stale results.
 * - Previous outlines stay visible while the next fetch completes (no flash).
 * - 100ms debounce to batch rapid selection clicks; AbortController cancels stale fetches.
 */
export function useLayerOutlines(
  areaId: number,
  layers: LayerWithCodes[] | undefined
): LayerOutline[] {
  const cacheKey = buildCacheKey(areaId, layers);
  const [outlines, setOutlines] = useState<LayerOutline[]>(
    () => outlineCache.get(cacheKey) ?? []
  );

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!areaId) return;

    const cached = outlineCache.get(cacheKey);
    if (cached) {
      setOutlines(cached);
      return;
    }

    // Clear previous timer; abort previous fetch
    if (timerRef.current) clearTimeout(timerRef.current);

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
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            // keep previous outlines on error
          }
        });
    }, 100);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [cacheKey, areaId]);

  return outlines;
}

// Re-export geodata hook type for base-map compatibility (unused but keeps imports clean)
export type { FeatureCollection, Geometry, MultiPolygon, Polygon };

