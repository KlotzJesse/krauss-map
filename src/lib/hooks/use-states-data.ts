import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

import type { CountryCode } from "@/lib/config/countries";

type StatesData = FeatureCollection<Polygon | MultiPolygon>;

const statesCache = new Map<string, StatesData>();

export function useStatesData(country: CountryCode = "DE"): StatesData | null {
  const [data, setData] = useState<StatesData | null>(
    statesCache.get(country) ?? null
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cached = statesCache.get(country);
    if (cached) {
      setData(cached);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    fetch(`/api/states?country=${country}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((json: StatesData) => {
        statesCache.set(country, json);
        setData(json);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          // Network error — silently ignored (user sees no data)
        }
      });

    return () => {
      controller.abort();
    };
  }, [country]);

  return data;
}
