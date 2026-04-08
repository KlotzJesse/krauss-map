"use client";

import { IconPalette } from "@tabler/icons-react";
import { Copy, Loader2, X } from "lucide-react";
import type { RefObject } from "react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ColorPicker,
  ColorPickerEyeDropper,
  ColorPickerFormat,
  ColorPickerHue,
  ColorPickerOutput,
  ColorPickerSelection,
} from "@/components/kibo-ui/color-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { copyPostalCodesCSV } from "@/lib/utils/export-utils";

export const DEFAULT_LAYER_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

interface LayerListItemLayer {
  id: number;
  name: string;
  color: string;
  postalCodes?: { postalCode: string }[];
}

interface LayerListItemProps {
  layer: LayerListItemLayer;
  activeLayerId?: number | null;
  isLayerSwitchPending?: boolean;
  editingLayerId: number | null;
  editingLayerName: string;
  editLayerInputRef: RefObject<HTMLInputElement | null>;
  onSelect: (layerId: number) => void;
  onStartEdit: (layerId: number, name: string) => void;
  onConfirmEdit: (layerId: number, name: string) => void;
  onCancelEdit: () => void;
  onEditNameChange: (name: string) => void;
  onColorChange: (layerId: number, color: string) => void;
  onDelete: (layerId: number) => void;
}

function LayerColorPickerContent({
  currentColor,
  onConfirm,
}: {
  currentColor: string;
  onConfirm: (hex: string) => void;
}) {
  const [pending, setPending] = useState(currentColor);
  const [pickerKey, setPickerKey] = useState(0);

  return (
    <div className="w-60 space-y-3">
      {/* Live preview */}
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 rounded border border-border shadow-sm shrink-0"
          style={{ backgroundColor: pending }}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {pending.toUpperCase()}
        </span>
      </div>

      {/* Preset swatches */}
      <div className="grid grid-cols-8 gap-1">
        {DEFAULT_LAYER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="h-6 w-6 rounded border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: pending === c ? "currentColor" : "transparent",
            }}
            onClick={() => {
              setPending(c);
              setPickerKey((k) => k + 1);
              onConfirm(c);
            }}
          />
        ))}
      </div>

      {/* Full color picker */}
      <ColorPicker
        key={pickerKey}
        defaultValue={pending}
        onChange={(value) => {
          const [r, g, b] = value as number[];
          const hex = `#${[r, g, b]
            .map((v) => Math.round(v).toString(16).padStart(2, "0"))
            .join("")}`;

          setPending(hex);
        }}
      >
        <ColorPickerSelection className="h-36 w-full" />
        <ColorPickerHue />
        <div className="flex items-center gap-2">
          <ColorPickerEyeDropper />
          <ColorPickerOutput />
          <ColorPickerFormat className="flex-1" />
        </div>
      </ColorPicker>

      <Button size="sm" className="w-full" onClick={() => onConfirm(pending)}>
        Farbe übernehmen
      </Button>
    </div>
  );
}

export function LayerListItem({
  layer,
  activeLayerId,
  isLayerSwitchPending = false,
  editingLayerId,
  editingLayerName,
  editLayerInputRef,
  onSelect,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onEditNameChange,
  onColorChange,
  onDelete,
}: LayerListItemProps) {
  const isOptimistic = layer.id > 1_000_000_000;
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  return (
    <div
      className={`group relative rounded-lg border transition-all ${
        activeLayerId === layer.id
          ? "border-primary bg-accent shadow-sm"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      } ${isOptimistic ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div
        role="button"
        tabIndex={0}
        className="px-3 py-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-lg"
        onClick={() => {
          if (!isOptimistic) {
            onSelect(layer.id);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isOptimistic) {
              onSelect(layer.id);
            }
          }
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className="w-3 h-3 rounded-sm shrink-0 border border-border"
              style={{ backgroundColor: layer.color }}
            />
            {editingLayerId === layer.id ? (
              <Input
                ref={editLayerInputRef}
                value={editingLayerName}
                onChange={(e) => onEditNameChange(e.target.value)}
                className="h-6 text-sm flex-1"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    onConfirmEdit(layer.id, editingLayerName);
                  } else if (e.key === "Escape") {
                    onCancelEdit();
                  }
                }}
                onBlur={() => {
                  if (editingLayerName.trim()) {
                    onConfirmEdit(layer.id, editingLayerName);
                  } else {
                    onCancelEdit();
                  }
                }}
              />
            ) : (
              <span
                className="font-medium text-sm truncate"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onStartEdit(layer.id, layer.name);
                }}
                title="Doppelklick zum Umbenennen"
              >
                {layer.name}
              </span>
            )}
            <Badge variant="secondary" className="text-xs">
              {layer.postalCodes?.length ?? 0}
            </Badge>
            {isLayerSwitchPending && activeLayerId === layer.id && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <PopoverTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                    />
                  }
                >
                  <IconPalette className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Gebiet-Farbe ändern</p>
                </TooltipContent>
              </Tooltip>
              <PopoverContent
                className="w-auto p-3"
                onClick={(e) => e.stopPropagation()}
              >
                <LayerColorPickerContent
                  currentColor={layer.color}
                  onConfirm={(hex) => {
                    onColorChange(layer.id, hex);
                    setColorPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const codes =
                        layer.postalCodes?.map((pc) => `D-${pc.postalCode}`) ??
                        [];
                      if (codes.length > 0) {
                        await copyPostalCodesCSV(codes);
                      } else {
                        toast.info("Keine Postleitzahlen zum Kopieren");
                      }
                    }}
                  />
                }
              >
                <Copy className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Postleitzahlen als CSV kopieren</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(layer.id);
                    }}
                  />
                }
              >
                <X className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Gebiet löschen</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
