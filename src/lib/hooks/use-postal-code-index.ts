"use client";

import { useEffect, useMemo, useState } from "react";

import {
  resolveGranularityForCountry,
  type CountryCode,
} from "@/lib/config/countries";
import { idbGet, idbSet } from "@/lib/utils/idb-geodata";

/** Wire format of /api/postal-codes/index/[granularity]. Quantized integers. */
interface IndexWire {
  country: string;
  granularity: string;
  codes: string[];
  cen: number[];
  area: number[];
  bb: number[];
}

/**
 * Every postal code in the loaded countries, with its representative point,
 * area and bounding box — but no outlines.
 *
 * Everything the app does with postal codes other than drawing them works off
 * this: coverage counts, layer membership, label placement, lasso and radius
 * selection, zoom-to-layer, import matching. Those consumers used to derive the
 * same values from the full country geometry, which meant downloading 867KB of
 * polygons and recomputing centroids from them on the main thread every load.
 *
 * Codes are exposed as composite keys ("DE:01067", "AT:1010", "CH:3800") to
 * match `getFeatureCode`, so a code cannot collide across the DACH countries.
 */
export interface PostalCodeIndex {
  /** Composite keys, ascending by code within each country. */
  keys: string[];
  /** Composite key -> its position in every parallel array below. */
  pos: ReadonlyMap<string, number>;
  /** [lng, lat, ...] in degrees. */
  cen: Float64Array;
  /** Square kilometres. */
  area: Float64Array;
  /** [minLng, minLat, maxLng, maxLat, ...] in degrees. */
  bounds: Float64Array;
}

export const EMPTY_INDEX: PostalCodeIndex = {
  keys: [],
  pos: new Map(),
  cen: new Float64Array(0),
  area: new Float64Array(0),
  bounds: new Float64Array(0),
};

/** Centroid of one code, or null if it is not in the loaded countries. */
export function indexCentroid(
  index: PostalCodeIndex,
  key: string
): [number, number] | null {
  const i = index.pos.get(key);
  if (i === undefined) {
    return null;
  }
  return [index.cen[i * 2], index.cen[i * 2 + 1]];
}

/** Bounds of one code as [minLng, minLat, maxLng, maxLat]. */
export function indexBounds(
  index: PostalCodeIndex,
  key: string
): [number, number, number, number] | null {
  const i = index.pos.get(key);
  if (i === undefined) {
    return null;
  }
  const b = index.bounds;
  return [b[i * 4], b[i * 4 + 1], b[i * 4 + 2], b[i * 4 + 3]];
}

const indexCache = new Map<string, PostalCodeIndex>();
const inflight = new Map<string, Promise<PostalCodeIndex>>();

const normalizeCountries = (
  country?: CountryCode | readonly CountryCode[]
): CountryCode[] => {
  if (!country) {
    return [];
  }
  return [...new Set(Array.isArray(country) ? country : [country])];
};

/** Undo the integer quantization the route applies, into flat Float64Arrays. */
function decode(wires: IndexWire[]): PostalCodeIndex {
  let total = 0;
  for (const wire of wires) {
    total += wire.codes.length;
  }

  const keys: string[] = new Array(total);
  const pos = new Map<string, number>();
  const cen = new Float64Array(total * 2);
  const area = new Float64Array(total);
  const bounds = new Float64Array(total * 4);

  let n = 0;
  for (const wire of wires) {
    for (let i = 0; i < wire.codes.length; i++) {
      const key = `${wire.country}:${wire.codes[i]}`;
      // A code can only belong to one country, but two countries' payloads are
      // merged here, so guard against a duplicate silently shifting the arrays.
      if (pos.has(key)) {
        continue;
      }
      const cx = wire.cen[i * 2];
      const cy = wire.cen[i * 2 + 1];
      const bx = Math.round(cx / 10);
      const by = Math.round(cy / 10);

      keys[n] = key;
      pos.set(key, n);
      cen[n * 2] = cx / 1e4;
      cen[n * 2 + 1] = cy / 1e4;
      area[n] = wire.area[i] / 10;
      bounds[n * 4] = (wire.bb[i * 4] + bx) / 1e3;
      bounds[n * 4 + 1] = (wire.bb[i * 4 + 1] + by) / 1e3;
      bounds[n * 4 + 2] = (wire.bb[i * 4 + 2] + bx) / 1e3;
      bounds[n * 4 + 3] = (wire.bb[i * 4 + 3] + by) / 1e3;
      n++;
    }
  }

  if (n === total) {
    return { keys, pos, cen, area, bounds };
  }
  return {
    keys: keys.slice(0, n),
    pos,
    cen: cen.slice(0, n * 2),
    area: area.slice(0, n),
    bounds: bounds.slice(0, n * 4),
  };
}

/**
 * Load the postal-code index for one or more countries.
 *
 * Two-layer cache like `useGeodata`: in-memory for the tab, IndexedDB across
 * sessions. The payload only changes when the postal-code dataset is
 * reimported, so the stored copy is served without revalidation and the HTTP
 * cache handles freshness.
 */
export function usePostalCodeIndex(
  granularity: string,
  country?: CountryCode | readonly CountryCode[]
): { index: PostalCodeIndex; isLoading: boolean; error: string | null } {
  const countries = useMemo(() => normalizeCountries(country), [country]);
  const cacheCountry = countries.length > 0 ? countries.join(",") : "ALL";
  const cacheKey = `pcindex:${granularity}:${cacheCountry}`;

  const [index, setIndex] = useState<PostalCodeIndex>(
    () => indexCache.get(cacheKey) ?? EMPTY_INDEX
  );
  const [isLoading, setIsLoading] = useState(() => !indexCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = indexCache.get(cacheKey);
    if (cached) {
      setIndex(cached);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const existing = inflight.get(cacheKey);
    const promise =
      existing ??
      (async () => {
        const stored = await idbGet<IndexWire[]>(cacheKey);
        if (stored && stored.length > 0) {
          const decoded = decode(stored);
          indexCache.set(cacheKey, decoded);
          return decoded;
        }

        const targets = countries.length > 0 ? countries : (["DE"] as const);
        const wires = await Promise.all(
          targets.map(async (countryCode) => {
            const resolved = resolveGranularityForCountry(
              granularity,
              countryCode
            );
            const res = await fetch(
              `/api/postal-codes/index/${resolved}?country=${countryCode}`
            );
            if (!res.ok) {
              throw new Error(`Failed to fetch postal code index: ${res.status}`);
            }
            return (await res.json()) as IndexWire;
          })
        );

        const decoded = decode(wires);
        indexCache.set(cacheKey, decoded);
        idbSet(cacheKey, wires);
        return decoded;
      })();

    if (!existing) {
      inflight.set(cacheKey, promise);
    }

    promise
      .then((result) => {
        inflight.delete(cacheKey);
        if (!cancelled) {
          setIndex(result);
          setIsLoading(false);
          setError(null);
        }
      })
      .catch((err) => {
        inflight.delete(cacheKey);
        if (!cancelled) {
          console.error("Postal code index fetch failed:", err);
          setIsLoading(false);
          setError(
            err instanceof Error
              ? err.message
              : "Postleitzahlen konnten nicht geladen werden"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, countries, granularity]);

  return { index, isLoading, error };
}
