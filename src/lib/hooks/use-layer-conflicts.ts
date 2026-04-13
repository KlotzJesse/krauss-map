import { useState, useCallback } from "react";

import type { Layer } from "../types/area-types";

interface ConflictingPostalCode {
  postalCode: string;
  layers: {
    id: number;
    name: string;
    color: string;
  }[];
}

export function useLayerConflicts(layers: Layer[]) {
  const [conflicts, setConflicts] = useState<ConflictingPostalCode[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  const detectConflicts = useCallback(() => {
    setIsDetecting(true);

    // Small delay to show loading state
    setTimeout(() => {
      const postalCodeMap = new Map<string, Layer[]>();

      // Build map of postal codes to layers
      layers.forEach((layer) => {
        layer.postalCodes?.forEach((pc) => {
          if (!postalCodeMap.has(pc.postalCode)) {
            postalCodeMap.set(pc.postalCode, []);
          }
          postalCodeMap.get(pc.postalCode)!.push(layer);
        });
      });

      // Find conflicts (postal codes in multiple layers)
      const conflictsList: ConflictingPostalCode[] = [];
      postalCodeMap.forEach((layerList, postalCode) => {
        if (layerList.length > 1) {
          conflictsList.push({
            postalCode,
            layers: layerList.map((l) => ({
              id: l.id,
              name: l.name,
              color: l.color,
            })),
          });
        }
      });

      setConflicts(conflictsList);
      setIsDetecting(false);
      return conflictsList;
    }, 100);
  }, [layers]);

  return {
    conflicts,
    detectConflicts,
    hasConflicts: conflicts.length > 0,
    isDetecting,
  };
}
