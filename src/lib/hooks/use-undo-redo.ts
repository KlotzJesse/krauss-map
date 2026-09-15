"use client";

import { useState, useCallback, useTransition } from "react";

import {
  undoChangeAction,
  redoChangeAction,
} from "@/app/actions/change-tracking-actions";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

interface UndoRedoStatus {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
}

interface UseUndoRedoOptions {
  onOptimisticUndo?: () => void;
  onOptimisticRedo?: () => void;
}

export function useUndoRedo(
  areaId: number | null,
  initialStatus?: UndoRedoStatus,
  onStatusUpdate?: () => void,
  options?: UseUndoRedoOptions
) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const canUndo = initialStatus?.canUndo;
  const canRedo = initialStatus?.canRedo;

  const undo = useCallback(async () => {
    if (!areaId || !canUndo || isLoading) {
      return;
    }

    setIsLoading(true);

    startTransition(async () => {
      // Optimistic update
      options?.onOptimisticUndo?.();

      try {
        await executeAction(undoChangeAction(areaId), {
          loading: "Mache Änderung rückgängig...",
          success: (data) => {
            if (data && "success" in data && data.success) {
              // Trigger revalidation to update status
              onStatusUpdate?.();
              return "Änderung rückgängig gemacht";
            }
            throw new Error(
              (data && "error" in data && data.error!) ||
                "Fehler beim Rückgängigmachen"
            );
          },
          error: "Fehler beim Rückgängigmachen",
        });
      } catch {
        // Error handled by executeAction callback
      }
      setIsLoading(false);
    });
  }, [areaId, canUndo, isLoading, onStatusUpdate, options]);

  const redo = useCallback(async () => {
    if (!areaId || !canRedo || isLoading) {
      return;
    }

    setIsLoading(true);

    startTransition(async () => {
      // Optimistic update
      options?.onOptimisticRedo?.();

      try {
        await executeAction(redoChangeAction(areaId), {
          loading: "Stelle Änderung wieder her...",
          success: (data) => {
            if (data && "success" in data && data.success) {
              // Trigger revalidation to update status
              onStatusUpdate?.();
              return "Änderung wiederhergestellt";
            }
            throw new Error(
              (data && "error" in data && data.error!) ||
                "Fehler beim Wiederherstellen"
            );
          },
          error: "Fehler beim Wiederherstellen",
        });
      } catch {
        // Error handled by executeAction callback
      }
      setIsLoading(false);
    });
  }, [areaId, canRedo, isLoading, onStatusUpdate, options]);

  // No keyboard shortcuts here on purpose. The toolbar that owns these buttons
  // binds Ctrl+Z itself and skips the shortcut while a text field has focus;
  // binding it here too meant one press ran undo twice, because both handlers
  // fire in the same tick and the `isLoading` guard has not committed yet.

  return {
    canUndo: initialStatus?.canUndo,
    canRedo: initialStatus?.canRedo,
    undoCount: initialStatus?.undoCount,
    redoCount: initialStatus?.redoCount,
    undo,
    redo,
    isLoading,
    isPending,
  };
}
