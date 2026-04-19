"use client";

import {
  Circle,
  Diamond,
  Lasso,
  MousePointer,
  Square,
  Triangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { memo, useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { TerraDrawMode } from "@/lib/hooks/use-terradraw";

interface FloatingDrawingToolbarProps {
  currentMode: TerraDrawMode | null;
  areaId: number | null | undefined;
  onModeChange: (mode: TerraDrawMode | null) => void;
  isPanelOpen?: boolean;
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

const ToolbarButton = memo(function ToolbarButton({
  modeId,
  icon: Icon,
  description,
  isActive,
  onClick,
}: {
  modeId: string;
  icon: LucideIcon;
  description: string;
  isActive: boolean;
  onClick: (modeId: string) => void;
}) {
  const handleClick = useCallback(() => onClick(modeId), [onClick, modeId]);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={isActive ? "default" : "outline"}
            size="sm"
            className="h-10 w-10 p-0 flex flex-col items-center gap-0.5"
            onClick={handleClick}
          />
        }
      >
        <Icon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent>
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  );
});

export function FloatingDrawingToolbar({
  currentMode,
  areaId,
  onModeChange,
  isPanelOpen = false,
}: FloatingDrawingToolbarProps) {
  const handleModeClick = useStableCallback((modeId: string) => {
    const terraDrawMode = (
      modeId === "cursor" ? "cursor" : modeId
    ) as TerraDrawMode | null;
    if (currentMode === terraDrawMode) {
      onModeChange(null);
      const modeInfo = drawingModes.find((m) => m.id === modeId);
      toast.success(`${modeInfo?.name || "Werkzeug"} deaktiviert`, {
        duration: 2000,
      });
    } else {
      onModeChange(terraDrawMode);
      const modeInfo = drawingModes.find((m) => m.id === modeId);
      toast.success(`${modeInfo?.name || "Werkzeug"} aktiviert`, {
        description: modeInfo?.description,
        duration: 3000,
      });
    }
  });

  return (
    <div className="absolute bottom-6 left-0 right-0 z-10 pointer-events-none">
      <div className="flex justify-center gap-2">
        <div className="bg-white/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-2 pointer-events-auto">
          <div className="flex items-center gap-1">
            {drawingModes.map((mode) => {
              const isActive =
                currentMode === mode.id ||
                (currentMode === null && mode.id === "cursor");
              return (
                <ToolbarButton
                  key={mode.id}
                  modeId={mode.id}
                  icon={mode.icon}
                  description={mode.description}
                  isActive={isActive}
                  onClick={handleModeClick}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
