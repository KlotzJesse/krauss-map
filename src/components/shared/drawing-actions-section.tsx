"use client";

import {
  Diamond,
  Loader2Icon,
  X,
} from "lucide-react";
import { Activity } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const DRAWING_MODES = [
  "freehand",
  "circle",
  "rectangle",
  "polygon",
  "point",
  "linestring",
  "angled-rectangle",
] as const;

interface DrawingActionsSectionProps {
  currentMode: string | null;
  postalCodesData: unknown;
  activeLayerId?: number | null;
  areaId?: number;
  isFilling: boolean;
  onFillHoles: () => void;
  onClearAll: () => void;
}

export function DrawingActionsSection({
  currentMode,
  postalCodesData: _postalCodesData,
  activeLayerId,
  areaId,
  isFilling,
  onFillHoles,
  onClearAll,
}: DrawingActionsSectionProps) {
  const isDrawingMode =
    currentMode !== null &&
    DRAWING_MODES.includes(currentMode as (typeof DRAWING_MODES)[number]);

  return (
    <>
      {isDrawingMode && (
        <>
          <Separator />
          <div className="space-y-1">
            <Button
              variant="destructive"
              size="sm"
              onClick={onClearAll}
              className="w-full h-7 text-xs"
            >
              <X className="h-3 w-3 mr-1.5" />
              Zeichnung löschen
            </Button>
            <Activity mode={!!(activeLayerId && areaId) ? "visible" : "hidden"}>
              <Button
                variant="secondary"
                size="sm"
                disabled={isFilling || !activeLayerId}
                onClick={onFillHoles}
                className="w-full h-7 text-xs"
              >
                {isFilling ? (
                  <Loader2Icon className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Diamond className="h-3 w-3 mr-1.5" />
                )}
                Löcher füllen
              </Button>
            </Activity>
          </div>
        </>
      )}
    </>
  );
}
