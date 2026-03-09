"use client";

import { IconArrowBackUp, IconArrowForwardUp } from "@tabler/icons-react";
import { useOptimistic } from "react";

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
  variant?: "default" | "floating";
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

  if (!areaId) {return null;}

  const isFloating = variant === "floating";

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
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={undo}
              disabled={!optimisticStatus.canUndo || isLoading}
              className="h-10 p-0 gap-2"
            >
              <IconArrowBackUp className="h-4 w-4" />
              Rückgängig
              {optimisticStatus.undoCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({optimisticStatus.undoCount})
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Letzte Änderung rückgängig machen (Strg+Z)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={redo}
              disabled={!optimisticStatus.canRedo || isLoading}
              className="h-10 p-0 gap-2"
            >
              <IconArrowForwardUp className="h-4 w-4" />
              Wiederholen
              {optimisticStatus.redoCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({optimisticStatus.redoCount})
                </span>
              )}
            </Button>
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
