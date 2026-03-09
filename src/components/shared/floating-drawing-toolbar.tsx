"use client";

import {
  Circle,
  Diamond,
  Lasso,
  MousePointer,
  Square,
  Triangle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TerraDrawMode } from "@/lib/hooks/use-terradraw";

// Floating undo/redo toolbar
const UndoRedoToolbar = dynamic(
  () =>
    import("@/components/areas/undo-redo-toolbar").then(
      (m) => m.UndoRedoToolbar
    ),
  {
    ssr: false,
  }
);

interface FloatingDrawingToolbarProps {
  currentMode: TerraDrawMode | null;
  areaId: number | null | undefined;
  onModeChange: (mode: TerraDrawMode | null) => void;
  initialUndoRedoStatus: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };
}

const drawingModes = [
  {
    id: "cursor" as const,
    name: "Cursor",
    icon: MousePointer,
    description: "Klicken Sie, um Regionen auszuwählen",
    category: "selection",
  },
  {
    id: "freehand" as const,
    name: "Lasso",
    icon: Lasso,
    description: "Freihand zeichnen, um Regionen auszuwählen",
    category: "drawing",
  },
  {
    id: "circle" as const,
    name: "Kreis",
    icon: Circle,
    description: "Kreis zeichnen, um Regionen auszuwählen",
    category: "drawing",
  },
  {
    id: "polygon" as const,
    name: "Polygon",
    icon: Triangle,
    description: "Polygon zeichnen, indem Sie Punkte klicken",
    category: "drawing",
  },
  {
    id: "rectangle" as const,
    name: "Rechteck",
    icon: Square,
    description: "Rechtecke zeichnen",
    category: "drawing",
  },
  {
    id: "angled-rectangle" as const,
    name: "Rechteck mit Winkel",
    icon: Diamond,
    description: "Rechtecke mit Winkeln zeichnen",
    category: "drawing",
  },
];

export function FloatingDrawingToolbar({
  currentMode,
  areaId,
  onModeChange,
  initialUndoRedoStatus,
}: FloatingDrawingToolbarProps) {
  // Map drawing mode IDs to TerraDrawModes
  const drawingModeToTerraDrawMode = (modeId: string): TerraDrawMode | null => {
    switch (modeId) {
      case "cursor":
        return "cursor";
      case "freehand":
        return "freehand";
      case "circle":
        return "circle";
      case "rectangle":
        return "rectangle";
      case "angled-rectangle":
        return "angled-rectangle"; // TerraDraw has a separate angled-rectangle mode
      case "polygon":
        return "polygon";
      default:
        return null;
    }
  };

  // Map TerraDrawMode back to drawing mode ID for UI state
  const terraDrawModeToDrawingMode = (
    mode: TerraDrawMode | null
  ): string | null => {
    switch (mode) {
      case "cursor":
        return "cursor";
      case "freehand":
        return "freehand";
      case "circle":
        return "circle";
      case "rectangle":
        return "rectangle";
      case "angled-rectangle":
        return "angled-rectangle"; // Map back to the angled-rectangle UI button
      case "polygon":
        return "polygon";
      default:
        return null;
    }
  };

  const handleModeClick = (modeId: string) => {
    const terraDrawMode = drawingModeToTerraDrawMode(modeId);
    if (currentMode === terraDrawMode) {
      // Deactivate current mode
      onModeChange(null);
      const modeInfo = drawingModes.find((m) => m.id === modeId);
      toast.success(`🖱️ ${modeInfo?.name || "Werkzeug"} deaktiviert`, {
        duration: 2000,
      });
    } else {
      // Activate new mode
      onModeChange(terraDrawMode);
      const modeInfo = drawingModes.find((m) => m.id === modeId);
      toast.success(`🎯 ${modeInfo?.name || "Werkzeug"} aktiviert`, {
        description: modeInfo?.description,
        duration: 3000,
      });
    }
  };

  return (
    <div className="absolute bottom-6 left-0 right-0 z-10 pointer-events-none">
      <div className="flex justify-center gap-2">
        <div className="bg-white/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-2 pointer-events-auto">
          <div className="flex items-center gap-1">
            {drawingModes.map((mode) => {
              const Icon = mode.icon;
              const isActive =
                terraDrawModeToDrawingMode(currentMode) === mode.id ||
                (currentMode === null && mode.id === "cursor");
              return (
                <Tooltip key={mode.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="h-10 w-10 p-0 flex flex-col items-center gap-0.5"
                      onClick={() => handleModeClick(mode.id)}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{mode.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div className="pointer-events-auto">
          <UndoRedoToolbar
            areaId={areaId!}
            variant="floating"
            initialStatus={initialUndoRedoStatus}
          />
        </div>
      </div>
    </div>
  );
}
