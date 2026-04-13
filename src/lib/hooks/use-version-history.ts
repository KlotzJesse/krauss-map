import { useCallback } from "react";
import { toast } from "sonner";

import {
  createVersionAction,
  restoreVersionAction,
} from "@/app/actions/version-actions";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

interface AreaVersion {
  id: number;
  areaId: number;
  versionNumber: number;
  name: string | null;
  description: string | null;
  snapshot: {
    areaName: string;
    granularity: string;
    layers: {
      id: number;
      name: string;
      color: string;
      opacity: number;
      isVisible: string;
      orderIndex: number;
      postalCodes: string[];
    }[];
  };
  changesSummary: string | null;
  createdBy: string | null;
  createdAt: string;
}

export function useVersionHistory(areaId: number) {
  const createVersion = useCallback(
    async (data: {
      name?: string;
      description?: string;
      changesSummary?: string;
      createdBy?: string;
    }) =>
      executeAction(
        (async () => {
          const result = await createVersionAction(areaId, data);
          if (result.success && result.data) {
            return result.data;
          }
          throw new Error(result.error || "Failed to create version");
        })(),
        {
          loading: "Erstelle Version...",
          success: (data) =>
            `Version ${(data as { versionNumber: number }).versionNumber} erfolgreich erstellt`,
          error: (err) =>
            `Fehler beim Erstellen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
        }
      ),
    [areaId]
  );

  const restoreVersion = useCallback(
    (version: AreaVersion) => {
      try {
        executeAction(
          (async () => {
            const result = await restoreVersionAction(areaId, version.id);
            if (result.success) {
              return `Version ${version.versionNumber} wiederhergestellt`;
            }
            throw new Error(result.error || "Failed to restore version");
          })(),
          {
            loading: "Wiederherstellen...",
            success: (message) => message as string,
            error: "Fehler beim Wiederherstellen",
          }
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        toast.error(`Fehler beim Wiederherstellen: ${errorMessage}`);
        throw error;
      }
    },
    [areaId]
  );

  return {
    createVersion,
    restoreVersion,
  };
}
