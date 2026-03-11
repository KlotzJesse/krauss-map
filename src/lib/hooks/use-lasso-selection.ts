import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import type { GeoJSONFeature, Map as MapLibre } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";

import { getLargestPolygonCentroid } from "@/lib/utils/map-data";

// Fixed: define LassoSelectionProps as a type
interface LassoSelectionProps {
  map: MapLibre | null;
  isMapLoaded: boolean;
  data: FeatureCollection<MultiPolygon | Polygon>;
  granularity: string;
  enabled: boolean;
  onRegionSelect?: (regionCode: string) => void;
  onRegionDeselect?: (regionCode: string) => void;
}

export function useLassoSelection({
  map,
  isMapLoaded,
  data,
  granularity: _granularity,
  enabled,
  onRegionSelect,
  onRegionDeselect: _onRegionDeselect,
}: LassoSelectionProps) {
  const isDrawing = useRef(false);
  const lassoPoints = useRef<[number, number][]>([]);

  // useEffectEvent: reads latest data/callbacks without triggering effect re-runs
  const onRegionSelectEvent = useEffectEvent((featureId: string) => {
    onRegionSelect?.(featureId);
  });

  const getDataFeatures = useEffectEvent(
    () => (data.features ?? []) as GeoJSONFeature[]
  );

  useEffect(() => {
    if (!map || !isMapLoaded) {
      return;
    }

    const canvas = map.getCanvas();
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

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
      if (!enabled) {
        return;
      }

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
      if (!isDrawing.current || !enabled) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      lassoPoints.current.push([x, y]);

      // Continue drawing
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const handleMouseUp = () => {
      if (!isDrawing.current || !enabled) {
        return;
      }

      isDrawing.current = false;

      // Close the path
      if (lassoPoints.current.length > 2) {
        ctx.closePath();
        ctx.stroke();

        // Find features within the lasso area
        const selectedFeatures = findFeaturesInLasso();

        // Update selected regions
        selectedFeatures.forEach((featureId) => {
          onRegionSelectEvent(featureId);
        });
      }

      // Clear the drawing
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lassoPoints.current = [];
    };

    const findFeaturesInLasso = (): string[] => {
      const selectedFeatures: string[] = [];
      const features = getDataFeatures();
      features.forEach((feature: GeoJSONFeature) => {
        // Use cached getLargestPolygonCentroid (WeakMap-backed, supports MultiPolygon)
        const centroid = getLargestPolygonCentroid(
          feature as unknown as Feature<Polygon | MultiPolygon>
        );
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

    const isPointInLasso = (point: [number, number]): boolean => {
      // Simple point-in-polygon test using ray casting
      if (lassoPoints.current.length < 3) {
        return false;
      }

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
    // granularity is not read inside the effect; data/callbacks are accessed
    // via useEffectEvent so they don't trigger listener re-attachment
  }, [map, isMapLoaded, enabled]);
}
