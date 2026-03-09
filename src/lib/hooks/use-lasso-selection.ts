import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { GeoJSONFeature, Map as MapLibre } from "maplibre-gl";
import { useEffect, useRef } from "react";

// Fixed: define LassoSelectionProps as a type
interface LassoSelectionProps {
  map: MapLibre | null;
  isMapLoaded: boolean;
  data: FeatureCollection<MultiPolygon | Polygon, GeoJsonProperties>;
  granularity: string;
  enabled: boolean;
  onRegionSelect?: (regionCode: string) => void;
  onRegionDeselect?: (regionCode: string) => void;
}

export function useLassoSelection({
  map,
  isMapLoaded,
  data,
  granularity,
  enabled,
  onRegionSelect,
  onRegionDeselect,
}: LassoSelectionProps) {
  const isDrawing = useRef(false);
  const lassoPoints = useRef<[number, number][]>([]);

  useEffect(() => {
    if (!map || !isMapLoaded) {return;}

    const canvas = map.getCanvas();
    const ctx = canvas.getContext("2d");

    if (!ctx) {return;}

    // Disable map interactions when lasso mode is enabled
    if (enabled) {
      map.dragPan.disable();
      map.dragRotate.disable();
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
    } else {
      // Re-enable map interactions when lasso mode is disabled
      map.dragPan.enable();
      map.dragRotate.enable();
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (!enabled) {return;}

      isDrawing.current = true;
      lassoPoints.current = [];

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      lassoPoints.current.push([x, y]);

      // Start drawing
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing.current || !enabled) {return;}

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      lassoPoints.current.push([x, y]);

      // Continue drawing
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const handleMouseUp = () => {
      if (!isDrawing.current || !enabled) {return;}

      isDrawing.current = false;

      // Close the path
      if (lassoPoints.current.length > 2) {
        ctx.closePath();
        ctx.stroke();

        // Find features within the lasso area
        const selectedFeatures = findFeaturesInLasso();

        // Update selected regions
        selectedFeatures.forEach((featureId) => {
          onRegionSelect?.(featureId);
        });
      }

      // Clear the drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lassoPoints.current = [];
    };

    const findFeaturesInLasso = (): string[] => {
      // Simple implementation - in a real app, you'd want more sophisticated point-in-polygon testing
      const selectedFeatures: string[] = [];
      const features = (data.features ?? []) as GeoJSONFeature[];
      features.forEach((feature: GeoJSONFeature) => {
        // Check if feature centroid is within lasso area
        const centroid = getFeatureCentroid(feature);
        if (centroid && isPointInLasso(centroid)) {
          const featureId =
            feature.properties?.code ||
            feature.properties?.PLZ ||
            feature.properties?.plz;
          if (featureId) {
            selectedFeatures.push(featureId);
          }
        }
      });
      return selectedFeatures;
    };

    const getFeatureCentroid = (
      feature: GeoJSONFeature
    ): [number, number] | null => {
      // Simple centroid calculation - in a real app, use a proper geometry library
      if (
        feature.geometry.type === "Polygon" &&
        Array.isArray(feature.geometry.coordinates)
      ) {
        const coords = feature.geometry.coordinates[0] as [number, number][];
        const sumX = coords.reduce(
          (sum: number, coord: [number, number]) => sum + coord[0],
          0
        );
        const sumY = coords.reduce(
          (sum: number, coord: [number, number]) => sum + coord[1],
          0
        );
        return [sumX / coords.length, sumY / coords.length];
      }
      return null;
    };

    const isPointInLasso = (point: [number, number]): boolean => {
      // Simple point-in-polygon test using ray casting
      if (lassoPoints.current.length < 3) {return false;}

      let inside = false;
      const [x, y] = point;

      for (
        let i = 0, j = lassoPoints.current.length - 1;
        i < lassoPoints.current.length;
        j = i++
      ) {
        const [xi, yi] = lassoPoints.current[i];
        const [xj, yj] = lassoPoints.current[j];

        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }

      return inside;
    };

    // Add event listeners only when enabled
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);

    return () => {
      // Cleanup event listeners
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);

      // Re-enable map interactions on cleanup
      map.dragPan.enable();
      map.dragRotate.enable();
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();

      // Clear any remaining drawing
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [
    map,
    isMapLoaded,
    data,
    granularity,
    enabled,
    onRegionSelect,
    onRegionDeselect,
  ]);
}
