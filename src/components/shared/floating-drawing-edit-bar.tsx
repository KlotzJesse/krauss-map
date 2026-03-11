"use client";

import { Pencil, Trash2, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FloatingDrawingEditBarProps {
  onDelete: () => void;
  onDismiss: () => void;
}

/**
 * Floating action bar that appears when a TerraDraw-drawn feature is selected.
 * Provides delete and dismiss actions, and hints the user they can drag vertices.
 * Escape key also dismisses the bar.
 */
export function FloatingDrawingEditBar({
  onDelete,
  onDismiss,
}: FloatingDrawingEditBarProps) {
  // Dismiss on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDismiss]);

  return (
    <div className="absolute bottom-24 left-0 right-0 z-10 pointer-events-none flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="bg-blue-600 text-white rounded-lg shadow-lg px-3 py-2 pointer-events-auto flex items-center gap-2">
        <Pencil className="h-3.5 w-3.5 shrink-0" />
        <div className="text-sm leading-tight">
          <span className="font-medium">Zeichnung ausgewählt</span>
          <span className="opacity-70 ml-2 text-xs hidden sm:inline">
            — Punkte verschieben zum Bearbeiten
          </span>
        </div>
        <div className="w-px h-6 bg-white/30 mx-1" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white"
                onClick={onDelete}
                aria-label="Zeichnung löschen"
              />
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent>Zeichnung löschen</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white"
                onClick={onDismiss}
                aria-label="Auswahl aufheben"
              />
            }
          >
            <X className="h-3.5 w-3.5" />
          </TooltipTrigger>
          <TooltipContent>Auswahl aufheben (Esc)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
