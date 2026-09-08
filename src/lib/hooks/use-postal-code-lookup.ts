import type { CountryCode } from "@/lib/config/countries";

import { useStableCallback } from "./use-stable-callback";

interface UsePostalCodeLookupOptions {
  granularity: string;
  countries: readonly CountryCode[];
}

/**
 * Resolve a coordinate to the postal code that contains it.
 *
 * Answered by PostGIS rather than on the client. The client version needed
 * every polygon in the country in memory to run point-in-polygon over a
 * bounding-box shortlist; this is a single indexed `ST_Contains` and is exact
 * for a case — a point on a boundary, an enclave — where the shortlist could
 * return the wrong neighbour.
 */
export function usePostalCodeLookup({
  granularity,
  countries,
}: UsePostalCodeLookupOptions) {
  const findPostalCodeByCoords = useStableCallback(
    async (lng: number, lat: number): Promise<string | null> => {
      const country = (countries.length > 0 ? countries : ["DE"]).join(",");
      try {
        const res = await fetch(
          `/api/postal-codes/at?lng=${lng}&lat=${lat}&granularity=${granularity}&country=${country}`
        );
        if (!res.ok) {
          return null;
        }
        const body = (await res.json()) as { code: string | null };
        return body.code;
      } catch (error) {
        console.error("Postal code lookup failed:", error);
        return null;
      }
    }
  );

  return { findPostalCodeByCoords };
}
