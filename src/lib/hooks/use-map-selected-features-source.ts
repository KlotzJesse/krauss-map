import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { useEffect } from "react";

import { featureCollectionFromIds } from "@/lib/utils/map-data";

interface UseMapSelectedFeaturesSourceProps {
  map: MapLibreMap | null;
  layerId: string;
  data: FeatureCollection<Polygon | MultiPolygon>;
  selectedRegions: string[];
  layersLoaded: boolean;
}

/**
 * Hook for managing the selected features source updates
 * Optimized to only update when necessary
 */
export function useMapSelectedFeaturesSource({
  map,
  layerId,
  data,
  selectedRegions,
  layersLoaded,
}: UseMapSelectedFeaturesSourceProps) {
  useEffect(() => {
    if (!map || !layersLoaded) {
      return;
    }

    const selectedSourceId = `${layerId}-selected-source`;
    const src = map.getSource(selectedSourceId) as GeoJSONSource | undefined;

    if (src && typeof src.setData === "function") {
      const selectedFeatureCollection = featureCollectionFromIds(
        data,
        selectedRegions
      );
      src.setData(selectedFeatureCollection);
    }
  }, [map, layerId, data, selectedRegions, layersLoaded]);
}
