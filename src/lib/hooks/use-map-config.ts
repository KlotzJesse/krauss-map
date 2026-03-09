import { useMemo } from "react";

import type { MapConfig } from "@/types/base-map";

/**
 * Hook for creating stable map configuration object
 * Prevents unnecessary re-renders by memoizing config values
 */
export function useMapConfig(
  center: [number, number],
  zoom: number
): MapConfig {
  return useMemo(
    () => ({
      center,
      zoom,
      style: "/versatilescolorful.json",
      minHeight: "400px",
    }),
    [center, zoom]
  );
}
