import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useMemo } from "react";

import type { PostalCodeIndex } from "@/lib/hooks/use-postal-code-index";
import {
  makeLabelPoints,
  makeLabelPointsFromIndex,
} from "@/lib/utils/map-data";

interface UseMapOptimizationsProps {
  index: PostalCodeIndex;
  statesData?: FeatureCollection<Polygon | MultiPolygon> | null;
}

/**
 * Memoized label placement for the map.
 *
 * Postal-code labels come from the index (codes, representative points and
 * areas) rather than from the polygons — see makeLabelPointsFromIndex. State
 * labels still come from the state outlines, which are a separate and much
 * smaller dataset.
 */
export function useMapOptimizations({
  index,
  statesData,
}: UseMapOptimizationsProps) {
  const labelPoints = useMemo(() => makeLabelPointsFromIndex(index), [index]);

  const statesLabelPoints = useMemo(
    () =>
      statesData ? (makeLabelPoints(statesData) as FeatureCollection) : null,
    [statesData]
  );

  return {
    labelPoints,
    statesLabelPoints,
  } as const;
}
