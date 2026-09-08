"use client";

import { useEffect, useRef, useState } from "react";

import {
  geocodeSearchAction,
  searchPostalCodesByBoundaryAction,
} from "@/app/actions/area-actions";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import {
  extractRawCode,
  storedCodeToCompositeKey,
} from "@/lib/utils/postal-code-keys";

export interface GeocodeResult {
  id: number | string;
  display_name: string;
  coordinates: [number, number];
  postal_code?: string;
  city?: string;
  state?: string;
  country?: string;
  isLocationBased?: boolean;
}

/**
 * True when a result is a place (city, state, region) rather than a specific
 * address. Those offer "select every postal code inside" instead of "add this
 * one". Copied unchanged from the map's address field so the behaviour of the
 * search does not shift with the move — covers DE, AT and CH.
 */
export function isAdministrativeAreaResult(result: GeocodeResult): boolean {
  if (result.postal_code) return false;
  return !!(
    result.city ||
    result.state ||
    result.display_name.includes(", Deutschland") ||
    result.display_name.includes(", Österreich") ||
    result.display_name.includes(", Austria") ||
    result.display_name.includes(", Schweiz") ||
    result.display_name.includes(", Switzerland") ||
    result.display_name.includes(", Bayern") ||
    result.display_name.includes(", Nordrhein-Westfalen") ||
    result.display_name.includes(" Deutschland") ||
    /\b(Stadt|Kreis|Landkreis|Region|Bundesland|Kanton|Bezirk|Gemeinde)\b/i.test(
      result.display_name
    )
  );
}

/** Truncate a 5-digit code to the granularity the map is showing. */
export function toGranularity(
  postalCode: string,
  granularity: string
): string {
  if (!postalCode) {
    return postalCode;
  }
  const digits = postalCode.replace(/\D/g, "");
  switch (granularity) {
    case "1digit":
      return digits.slice(0, 1);
    case "2digit":
      return digits.slice(0, 2);
    case "3digit":
      return digits.slice(0, 3);
    default:
      return digits;
  }
}

/** The layers that already contain a given postal code. */
export function layersContaining(
  postalCode: string,
  layers: {
    id: number;
    name: string;
    color: string;
    postalCodes?: { postalCode: string }[];
  }[]
) {
  if (layers.length === 0 || !postalCode) {
    return [];
  }
  const sameCode = (left: string, right: string) => {
    const leftKey = storedCodeToCompositeKey(left);
    const rightKey = storedCodeToCompositeKey(right);
    if (leftKey && rightKey) {
      return leftKey === rightKey;
    }
    return extractRawCode(left) === extractRawCode(right);
  };
  return layers.filter((layer) =>
    layer.postalCodes?.some((pc) => sameCode(pc.postalCode, postalCode))
  );
}

/** How a result should read in a list. */
export function formatGeocodeResult(result: GeocodeResult): string {
  if (isAdministrativeAreaResult(result)) {
    const name =
      result.city ?? result.state ?? result.display_name.split(",")[0].trim();
    return `${name} (Gebiet)`;
  }
  if (result.postal_code) {
    return `${result.postal_code} — ${result.city ?? result.display_name}`;
  }
  return result.display_name;
}

/**
 * Debounced address, city and region lookup.
 *
 * Extracted from the map's own address field so the command palette can be the
 * single place this happens. Late responses are dropped by request id rather
 * than by cancelling, so a slow lookup can never overwrite a newer one.
 */
export function useGeocodeSearch(query: string, enabled = true) {
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++requestIdRef.current;

    if (!enabled || trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await geocodeSearchAction({
          query: trimmed,
          // Only ask for postal codes when the query looks like a street
          // address; a bare city name matches far more without it.
          includePostalCode: /\d/.test(trimmed),
          limit: 8,
          enhancedSearch: true,
        });
        if (requestId !== requestIdRef.current) {
          return;
        }
        setResults(
          response.success && response.data
            ? ((response.data.results ?? []) as GeocodeResult[])
            : []
        );
      } catch (error) {
        if (requestId === requestIdRef.current) {
          console.error("Geocoding failed:", error);
          setResults([]);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, enabled]);

  return { results, isLoading };
}

/** Every postal code inside an administrative area, for "select all". */
export function useBoundaryPostalCodes() {
  return useStableCallback(
    async (
      result: GeocodeResult,
      granularity: string
    ): Promise<{ postalCodes: string[]; areaName: string } | null> => {
      const areaName =
        result.city ?? result.state ?? result.display_name.split(",")[0].trim();
      const response = await searchPostalCodesByBoundaryAction({
        areaName,
        granularity,
        limit: 3000,
      });
      if (!response.success || !response.data?.postalCodes?.length) {
        return null;
      }
      return {
        postalCodes: response.data.postalCodes,
        areaName: response.data.areaInfo?.name ?? areaName,
      };
    }
  );
}
