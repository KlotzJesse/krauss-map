import { useCallback } from "react";
import { toast } from "sonner";

import {
  deleteLayerAction,
  updateLayerAction,
} from "@/app/actions/area-actions";

import type { Layer } from "../types/area-types";

interface LayerMergeProps {
  areaId: number;
  layers: Layer[];
  onLayerUpdate?: () => void;
}

export function useLayerMerge({
  areaId,
  layers,
  onLayerUpdate: _onLayerUpdate,
}: LayerMergeProps) {
  const mergeLayers = useCallback(
    async (
      sourceLayerIds: number[],
      targetLayerId: number,
      mergeStrategy: "union" | "keep-target" | "keep-source" = "union"
    ) => {
      try {
        const targetLayer = layers.find((l) => l.id === targetLayerId);
        if (!targetLayer) {
          throw new Error("Target layer not found");
        }

        const sourceLayers = layers.filter((l) =>
          sourceLayerIds.includes(l.id)
        );
        if (sourceLayers.length === 0) {
          throw new Error("No source layers found");
        }

        // Get all postal codes from source layers
        const sourcePostalCodes = sourceLayers.flatMap(
          (l) => l.postalCodes?.map((pc) => pc.postalCode) || []
        );

        const targetPostalCodes =
          targetLayer.postalCodes?.map((pc) => pc.postalCode) || [];

        let mergedPostalCodes: string[];

        switch (mergeStrategy) {
          case "union": {
            // Combine all unique postal codes
            mergedPostalCodes = [
              ...new Set([...targetPostalCodes, ...sourcePostalCodes]),
            ];
            break;
          }
          case "keep-target": {
            // Only keep target postal codes (ignore source)
            mergedPostalCodes = targetPostalCodes;
            break;
          }
          case "keep-source": {
            // Replace target with source postal codes
            mergedPostalCodes = [...new Set(sourcePostalCodes)];
            break;
          }
        }

        // Update target layer with merged postal codes
        await updateLayerAction(areaId, targetLayerId, {
          postalCodes: mergedPostalCodes,
        });

        // Delete source layers after successful merge
        await Promise.all(
          sourceLayerIds.map((id) => deleteLayerAction(areaId, id))
        );

        toast.success(
          `${sourceLayers.length} Layer in "${targetLayer.name}" zusammengeführt`
        );

        return mergedPostalCodes;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        toast.error(`Fehler beim Zusammenführen: ${errorMessage}`);
        throw error;
      }
    },
    [layers, areaId]
  );

  const splitLayer = useCallback(
    async (
      sourceLayerId: number,
      newLayerName: string,
      postalCodes: string[]
    ) => {
      try {
        const sourceLayer = layers.find((l) => l.id === sourceLayerId);
        if (!sourceLayer) {
          throw new Error("Source layer not found");
        }

        // Remove postal codes from source layer
        const remainingCodes =
          sourceLayer.postalCodes
            ?.map((pc) => pc.postalCode)
            .filter((code) => !postalCodes.includes(code)) || [];

        await updateLayerAction(areaId, sourceLayerId, {
          postalCodes: remainingCodes,
        });

        // Create new layer is handled by the calling component
        toast.success(`Layer "${sourceLayer.name}" aufgeteilt`);

        return { remainingCodes, splitCodes: postalCodes };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        toast.error(`Fehler beim Aufteilen: ${errorMessage}`);
        throw error;
      }
    },
    [layers, areaId]
  );

  return {
    mergeLayers,
    splitLayer,
  };
}
