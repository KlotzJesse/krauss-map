import union from "@turf/union";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
} from "geojson";
import { useEffect, useState } from "react";

export interface LayerOutline {
  layerId: number;
  color: string;
  opacity: number;
  outline: Geometry;
}

type LayerWithCodes = {
  id: number;
  color: string;
  opacity: number;
  isVisible: string;
  postalCodes?: { postalCode: string }[];
};

/**
 * Computes dissolved outer outlines per visible layer entirely client-side.
 *
 * Uses @turf/union on the already-loaded geodata FeatureCollection — no
 * network round-trips. Runs asynchronously so it never blocks a render frame.
 * Cancelled immediately on the next change via a `cancelled` flag.
 */
export function useLayerOutlines(
  geodata: FeatureCollection<Polygon | MultiPolygon>,
  layers: LayerWithCodes[] | undefined
): LayerOutline[] {
  const [outlines, setOutlines] = useState<LayerOutline[]>([]);

  useEffect(() => {
    if (!layers?.length || !geodata.features.length) {
      setOutlines([]);
      return;
    }

    let cancelled = false;

    // Build code → feature lookup once per geodata reference
    const featureByCode = new Map<string, Feature<Polygon | MultiPolygon>>();
    for (const feature of geodata.features) {
      const code = feature.properties?.code as string | undefined;
      if (code) featureByCode.set(code, feature);
    }

    const computed: LayerOutline[] = [];

    for (const layer of layers) {
      if (layer.isVisible !== "true") continue;
      if (!layer.postalCodes?.length) continue;

      const features = layer.postalCodes
        .map((pc) => featureByCode.get(pc.postalCode))
        .filter(
          (f): f is Feature<Polygon | MultiPolygon> =>
            f !== undefined && f.geometry != null
        );
      if (!features.length) continue;

      // Compute union via @turf/union (v7 takes a FeatureCollection)
      const merged = union({
        type: "FeatureCollection" as const,
        features: features as Feature<Polygon | MultiPolygon>[],
      });

      if (merged) {
        computed.push({
          layerId: layer.id,
          color: layer.color,
          opacity: layer.opacity,
          outline: merged.geometry,
        });
      }
    }

    if (!cancelled) setOutlines(computed);

    return () => {
      cancelled = true;
    };
  }, [geodata, layers]);

  return outlines;
}
