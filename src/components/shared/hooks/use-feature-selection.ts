import type { PostalCodeIndex } from "@/lib/hooks/use-postal-code-index";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { compositeKeyToStoredCode } from "@/lib/utils/deck-gl-utils";
import { isPointInPolygon } from "@/lib/utils/map-data";
import type { MapLibreMap } from "@/types/map";

/**
 * Lasso and radius selection both decide membership by a code's representative
 * point, never by its outline — so they run off the postal-code index rather
 * than the polygons. The point is `ST_PointOnSurface`, which is guaranteed to
 * lie inside the code's own area; the centre of mass this used to compute from
 * the geometry is not, and could fall outside a concave code.
 */

/** Codes whose representative point lies inside the drawn polygon. */
export function useFindFeaturesInPolygon(index: PostalCodeIndex) {
  return useStableCallback((polygon: number[][]): string[] => {
    if (polygon.length < 3) {
      return [];
    }
    const selected: string[] = [];
    for (let i = 0; i < index.keys.length; i++) {
      const lng = index.cen[i * 2];
      const lat = index.cen[i * 2 + 1];
      if (
        isPointInPolygon([lng, lat], polygon as [number, number][])
      ) {
        selected.push(compositeKeyToStoredCode(index.keys[i]));
      }
    }
    return selected;
  });
}

/** Codes whose representative point lies within the circle. */
export function useFindFeaturesInCircle(index: PostalCodeIndex) {
  return useStableCallback(
    (center: [number, number], radiusDegrees: number): string[] => {
      const [lng1, lat1] = center;
      const selected: string[] = [];
      for (let i = 0; i < index.keys.length; i++) {
        const lng2 = index.cen[i * 2];
        const lat2 = index.cen[i * 2 + 1];
        if (Math.hypot(lat2 - lat1, lng2 - lng1) <= radiusDegrees) {
          selected.push(compositeKeyToStoredCode(index.keys[i]));
        }
      }
      return selected;
    }
  );
}

// Convert pixel radius to geographic radius (degrees)
export function useConvertRadiusToGeographic(
  mapRef: React.RefObject<MapLibreMap | null>
) {
  return useStableCallback(
    (pixelRadius: number, center: [number, number]): number => {
      if (!mapRef.current) {
        return pixelRadius;
      }
      try {
        const zoom = mapRef.current.getZoom();
        const metersPerPixel =
          (156_543.033_92 * Math.cos((center[1] * Math.PI) / 180)) / 2 ** zoom;
        const geographicRadiusMeters = pixelRadius * metersPerPixel;
        const geographicRadiusDegrees = geographicRadiusMeters / 111_320;
        return geographicRadiusDegrees;
      } catch {
        return pixelRadius;
      }
    }
  );
}
