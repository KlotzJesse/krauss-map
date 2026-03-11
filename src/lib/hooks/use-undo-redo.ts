"use client";

import { useState, useEffect, useCallback, useTransition } from "react";

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

  const undo = useCallback(async () => {
    if (!areaId || !initialStatus?.canUndo || isLoading) {
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
      } finally {
        setIsLoading(false);
      }
    });
  }, [areaId, initialStatus?.canUndo, isLoading, onStatusUpdate, options]);

  const redo = useCallback(async () => {
    if (!areaId || !initialStatus?.canRedo || isLoading) {
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
      } finally {
        setIsLoading(false);
      }
    });
  }, [areaId, initialStatus?.canRedo, isLoading, onStatusUpdate, options]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z or Cmd+Shift+Z or Ctrl+Y or Cmd+Y for redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

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
