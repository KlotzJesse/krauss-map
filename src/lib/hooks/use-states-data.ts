import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef, useState } from "react";

type StatesData = FeatureCollection<Polygon | MultiPolygon>;

let cachedStatesData: StatesData | null = null;

export function useStatesData(): StatesData | null {
  const [data, setData] = useState<StatesData | null>(cachedStatesData);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (cachedStatesData) {
      setData(cachedStatesData);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    fetch("/api/states", { signal: controller.signal })
      .then((res) => res.json())
      .then((json: StatesData) => {
        cachedStatesData = json;
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
  }, []);

  return data;
}
