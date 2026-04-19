"use client";

import { IconArrowBackUp, IconArrowForwardUp } from "@tabler/icons-react";
import { useOptimistic, useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useUndoRedo } from "@/lib/hooks/use-undo-redo";
import { cn } from "@/lib/utils";

interface UndoRedoToolbarProps {
  areaId: number | null;
  className?: string;
  variant?: "default" | "floating" | "icon";
  initialStatus?: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };
  onStatusUpdate?: () => void;
}

export function UndoRedoToolbar({
  areaId,
  className,
  variant = "default",
  initialStatus,
  onStatusUpdate,
}: UndoRedoToolbarProps) {
  // Optimistic state for undo/redo counts
  const [optimisticStatus, updateOptimisticStatus] = useOptimistic(
    initialStatus || {
      canUndo: false,
      canRedo: false,
      undoCount: 0,
      redoCount: 0,
    },
    (current, action: "undo" | "redo") => {
      if (action === "undo") {
        return {
          canUndo: current.undoCount > 1,
          canRedo: true,
          undoCount: Math.max(0, current.undoCount - 1),
          redoCount: current.redoCount + 1,
        };
      }
      return {
        canUndo: true,
        canRedo: current.redoCount > 1,
        undoCount: current.undoCount + 1,
        redoCount: Math.max(0, current.redoCount - 1),
      };
    }
  );

  const { undo, redo, isLoading } = useUndoRedo(
    areaId,
    optimisticStatus,
    onStatusUpdate,
    {
      onOptimisticUndo: () => updateOptimisticStatus("undo"),
      onOptimisticRedo: () => updateOptimisticStatus("redo"),
    }
  );

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Shift+Z / Ctrl+Y = redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInInput =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (isInInput) return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (optimisticStatus.canUndo && !isLoading) undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        if (optimisticStatus.canRedo && !isLoading) redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    undo,
    redo,
    optimisticStatus.canUndo,
    optimisticStatus.canRedo,
    isLoading,
  ]);

  if (!areaId) {
    return null;
  }

  const isFloating = variant === "floating";
  const isIcon = variant === "icon";

  if (isIcon) {
    return (
      <TooltipProvider>
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={undo}
                  disabled={!optimisticStatus.canUndo || isLoading}
                  aria-label="Rückgängig (Strg+Z)"
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed",
                    className
                  )}
                />
              }
            >
              <IconArrowBackUp className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right" className="whitespace-nowrap">
              <p>
                Rückgängig (Strg+Z)
                {optimisticStatus.undoCount > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    ({optimisticStatus.undoCount})
                  </span>
                )}
              </p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={redo}
                  disabled={!optimisticStatus.canRedo || isLoading}
                  aria-label="Wiederholen (Strg+Umschalt+Z)"
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed",
                    className
                  )}
                />
              }
            >
              <IconArrowForwardUp className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent side="right" className="whitespace-nowrap">
              <p>
                Wiederholen (Strg+Umschalt+Z)
                {optimisticStatus.redoCount > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    ({optimisticStatus.redoCount})
                  </span>
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        </>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex items-center gap-1",
          isFloating &&
            "bg-white/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-2 pointer-events-auto",
          className
        )}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                onClick={undo}
                disabled={!optimisticStatus.canUndo || isLoading}
                className="h-10 px-3 flex items-center gap-2"
              />
            }
          >
            <IconArrowBackUp className="h-4 w-4" />
            Rückgängig
            {optimisticStatus.undoCount > 0 && (
              <span className="text-xs text-muted-foreground">
                ({optimisticStatus.undoCount})
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>Letzte Änderung rückgängig machen (Strg+Z)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                onClick={redo}
                disabled={!optimisticStatus.canRedo || isLoading}
                className="h-10 px-3 flex items-center gap-2"
              />
            }
          >
            <IconArrowForwardUp className="h-4 w-4" />
            Wiederholen
            {optimisticStatus.redoCount > 0 && (
              <span className="text-xs text-muted-foreground">
                ({optimisticStatus.redoCount})
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>
              Letzte rückgängig gemachte Änderung wiederholen (Strg+Umschalt+Z
              oder Strg+Y)
            </p>
          </TooltipContent>
        </Tooltip>

        {isLoading && (
          <div className="ml-2 flex items-center text-xs text-muted-foreground">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current mr-1" />
            Verarbeitung...
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
