import { useState, useCallback, useMemo } from "react";

import type { Layer } from "../types/area-types";

interface ConflictLayerInfo {
  id: number;
  name: string;
  color: string;
}

export interface ConflictingPostalCode {
  postalCode: string;
  layers: ConflictLayerInfo[];
}

/** A group of conflicts sharing the same set of layers (by sorted IDs). */
export interface ConflictGroup {
  /** Stable key derived from sorted layer IDs, e.g. "12-45" */
  key: string;
  layers: ConflictLayerInfo[];
  postalCodes: string[];
}

export function useLayerConflicts(layers: Layer[]) {
  const [conflicts, setConflicts] = useState<ConflictingPostalCode[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  const detectConflicts = useCallback(() => {
    setIsDetecting(true);

    // Small delay to show loading state
    setTimeout(() => {
      const postalCodeMap = new Map<string, Layer[]>();

      for (const layer of layers) {
        if (!layer.postalCodes) continue;
        for (const pc of layer.postalCodes) {
          const existing = postalCodeMap.get(pc.postalCode);
          if (existing) {
            existing.push(layer);
          } else {
            postalCodeMap.set(pc.postalCode, [layer]);
          }
        }
      }

      const conflictsList: ConflictingPostalCode[] = [];
      for (const [postalCode, layerList] of postalCodeMap) {
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
      }

      setConflicts(conflictsList);
      setIsDetecting(false);
    }, 100);
  }, [layers]);

  /** Conflicts grouped by their exact layer-pair (or layer-set). Sorted largest group first. */
  const conflictGroups = useMemo<ConflictGroup[]>(() => {
    const groupMap = new Map<string, ConflictGroup>();

    for (const conflict of conflicts) {
      const sortedIds = conflict.layers.map((l) => l.id).sort((a, b) => a - b);
      const key = sortedIds.join("-");

      const existing = groupMap.get(key);
      if (existing) {
        existing.postalCodes.push(conflict.postalCode);
      } else {
        groupMap.set(key, {
          key,
          layers: conflict.layers,
          postalCodes: [conflict.postalCode],
        });
      }
    }

    return [...groupMap.values()].sort(
      (a, b) => b.postalCodes.length - a.postalCodes.length
    );
  }, [conflicts]);

  return {
    conflicts,
    conflictGroups,
    detectConflicts,
    hasConflicts: conflicts.length > 0,
    isDetecting,
  };
}
