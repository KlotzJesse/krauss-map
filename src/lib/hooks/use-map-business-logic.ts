import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useMemo } from "react";

interface UseMapBusinessLogicProps {
  data: FeatureCollection<Polygon | MultiPolygon>;
  selectedRegions: string[];
  layerId: string;
}

/**
 * Hook for centralized business logic calculations
 * Contains all shared map layer IDs, source IDs, and business rules
 * Ensures consistency across all map interactions
 */
export function useMapBusinessLogic({
  data,
  selectedRegions,
  layerId,
}: UseMapBusinessLogicProps) {
  // Memoize layer and source IDs for consistency
  const layerIds = useMemo(
    () => ({
      main: `${layerId}-layer`,
      selected: `${layerId}-selected-layer`,
      hover: `${layerId}-hover-layer`,
      labels: `${layerId}-labels-layer`,
      selectedLabels: `${layerId}-selected-labels-layer`,
      states: "states-layer",
      statesLabels: "states-labels-layer",
    }),
    [layerId]
  );

  const sourceIds = useMemo(
    () => ({
      main: `${layerId}-source`,
      selected: `${layerId}-selected-source`,
      hover: `${layerId}-hover-source`,
      labels: `${layerId}-labels-source`,
      selectedLabels: `${layerId}-selected-labels-source`,
      states: "states-source",
      statesLabels: "states-labels-source",
    }),
    [layerId]
  );

  // Business logic: calculate selection statistics
  const selectionStats = useMemo(() => {
    const totalFeatures = data.features.length;
    const selectedCount = selectedRegions.length;
    const selectionPercentage =
      totalFeatures > 0 ? (selectedCount / totalFeatures) * 100 : 0;

    return {
      totalFeatures,
      selectedCount,
      selectionPercentage: Math.round(selectionPercentage * 100) / 100,
      hasSelection: selectedCount > 0,
      isFullSelection: selectedCount === totalFeatures,
    };
  }, [data.features.length, selectedRegions.length]);

  // Business logic: feature validation
  const validateFeature = useMemo(
    () =>
      (
        feature: unknown
      ): feature is {
        properties?: { code?: string };
        geometry: Polygon | MultiPolygon;
      } => {
        if (typeof feature !== "object" || feature === null) {
          return false;
        }
        if (!("properties" in feature) || !("geometry" in feature)) {
          return false;
        }

        const featureObj = feature as Record<string, unknown>;
        if (
          typeof featureObj.properties !== "object" ||
          featureObj.properties === null
        ) {
          return false;
        }

        const properties = featureObj.properties as Record<string, unknown>;
        if (!("code" in properties) || typeof properties.code !== "string") {
          return false;
        }

        const geometry = featureObj.geometry as Record<string, unknown>;
        return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
      },
    []
  );

  // Business logic: coordinate validation
  const validateCoordinates = useMemo(
    () =>
      (coords: unknown): coords is [number, number] =>
        Array.isArray(coords) &&
        coords.length === 2 &&
        typeof coords[0] === "number" &&
        typeof coords[1] === "number" &&
        !isNaN(coords[0]) &&
        !isNaN(coords[1]) &&
        coords[0] >= -180 &&
        coords[0] <= 180 &&
        coords[1] >= -90 &&
        coords[1] <= 90,
    []
  );

  // Business logic: check if coordinates are geographic (vs screen/pixel)
  const isGeographicCoordinate = useMemo(
    () =>
      (coord: [number, number]): boolean =>
        coord[0] >= -180 &&
        coord[0] <= 180 &&
        coord[1] >= -90 &&
        coord[1] <= 90,
    []
  );

  // Business rules: minimum polygon requirements
  const polygonRequirements = useMemo(
    () => ({
      minPoints: 3,
      maxPoints: 10_000, // Prevent memory issues with overly complex polygons
      minArea: 0.0001, // Minimum area threshold in degrees
    }),
    []
  );

  // Business rules: selection limits
  const selectionLimits = useMemo(
    () => ({
      maxSelections: 5000, // Increased to handle large states like Bayern (2320 postal codes)
      warnThreshold: 1000, // Warn user about performance when selecting many postal codes
    }),
    []
  );

  return {
    layerIds,
    sourceIds,
    selectionStats,
    validateFeature,
    validateCoordinates,
    isGeographicCoordinate,
    polygonRequirements,
    selectionLimits,
  } as const;
}
