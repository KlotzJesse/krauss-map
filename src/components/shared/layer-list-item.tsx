"use client";

import { IconPalette } from "@tabler/icons-react";
import {
  ArrowRightLeft,
  CheckSquare,
  Clock,
  Copy,
  CopyPlus,
  Download,
  Eye,
  EyeOff,
  Focus,
  Folder,
  FolderOpen,
  GitCompareArrows,
  GitMerge,
  GripVertical,
  History,
  List,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  Scissors,
  Square,
  StickyNote,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import type { RefObject } from "react";
import { memo, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";

import { getLayerHistoryAction } from "@/app/actions/area-actions";
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
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { copyPostalCodesCSV } from "@/lib/utils/export-utils";
import { generatePalette } from "@/lib/utils/layer-colors";

export const DEFAULT_LAYER_COLORS = generatePalette(16);

interface LayerListItemLayer {
  id: number;
  name: string;
  color: string;
  opacity?: number | null;
  isVisible?: string;
  notes?: string | null;
  groupName?: string | null;
  postalCodes?: { postalCode: string }[];
}

interface LayerListItemProps {
  layer: LayerListItemLayer;
  activeLayerId?: number | null;
  isLayerSwitchPending?: boolean;
  duplicateCount?: number;
  editingLayerId: number | null;
  editingLayerName: string;
  editLayerInputRef: RefObject<HTMLInputElement | null>;
  onSelect: (layerId: number) => void;
  onStartEdit: (layerId: number, name: string) => void;
  onConfirmEdit: (layerId: number, name: string) => void;
  onCancelEdit: () => void;
  onEditNameChange: (name: string) => void;
  onColorChange: (layerId: number, color: string) => void;
  onOpacityChange?: (layerId: number, opacity: number) => void;
  onDelete: (layerId: number) => void;
  onDuplicateLayer?: (layerId: number) => void;
  onCopyToArea?: (layerId: number, layerName: string) => void;
  onMergeLayer?: (layerId: number, layerName: string) => void;
  onToggleVisibility?: (layerId: number, visible: boolean) => void;
  onSoloLayer?: (layerId: number) => void;
  onRemovePostalCode?: (layerId: number, postalCode: string) => void;
  onMovePlz?: (
    fromLayerId: number,
    toLayerId: number,
    postalCode: string
  ) => void;
  otherLayers?: { id: number; name: string; color: string }[];
  onImportCSV?: (layerId: number) => void;
  onNotesChange?: (layerId: number, notes: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (layerId: number) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isLocked?: boolean;
  onToggleLock?: (layerId: number) => void;
  onPreviewPostalCode?: (postalCode: string | null) => void;
  onZoomToLayer?: (layerId: number) => void;
  onClearPLZ?: (layerId: number) => void;
  onAddPlzRange?: (layerId: number, codes: string[]) => void;
  allCodesSet?: Set<string>;
  onBulkMovePlz?: (
    fromLayerId: number,
    toLayerId: number,
    codes: string[]
  ) => void;
  onBulkRemovePlz?: (layerId: number, codes: string[]) => void;
  onExportCSV?: (layerId: number, layerName: string, codes: string[]) => void;
  onSplitLayer?: (layerId: number, splitCount: number) => void;
  onCompareLayer?: (layerId: number) => void;
  onSetGroup?: (layerId: number, groupName: string | null) => void;
  existingGroups?: string[];
  layerIndex?: number; // 0-based position in layer list (for F-key shortcut badge)
  maxLayerPLZ?: number; // max PLZ count across all layers — used for relative coverage bar
  onHighlightCodes?: (codes: Set<string> | null) => void;
}

function LayerColorPickerContent({
  currentColor,
  currentOpacity,
  usedColors,
  onConfirm,
  onOpacityChange,
}: {
  currentColor: string;
  currentOpacity: number;
  usedColors?: string[];
  onConfirm: (hex: string) => void;
  onOpacityChange?: (opacity: number) => void;
}) {
  const [pending, setPending] = useState(currentColor);
  const [pickerKey, setPickerKey] = useState(0);
  const [opacity, setOpacity] = useState(currentOpacity);

  const usedSet = useMemo(
    () => new Set((usedColors ?? []).map((c) => c.toLowerCase())),
    [usedColors]
  );

  return (
    <div className="w-60 space-y-3">
      {/* Live preview */}
      <div className="flex items-center gap-2">
        <div
          className="h-7 w-7 rounded border border-border shadow-sm shrink-0"
          style={{ backgroundColor: pending, opacity: opacity / 100 }}
        />
        <span className="font-mono text-xs text-muted-foreground">
          {pending.toUpperCase()}
        </span>
      </div>

      {/* Preset swatches — unused colors first, used colors dimmed */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-1">
          Palette (● = bereits verwendet)
        </div>
        <div className="grid grid-cols-8 gap-1">
          {DEFAULT_LAYER_COLORS.map((c) => {
            const isUsed = usedSet.has(c.toLowerCase());
            return (
              <button
                key={c}
                type="button"
                title={isUsed ? `${c} (in Benutzung)` : c}
                className={`h-6 w-6 rounded border-2 transition-transform hover:scale-110 relative ${isUsed ? "opacity-40" : "ring-0"}`}
                style={{
                  backgroundColor: c,
                  borderColor:
                    pending.toLowerCase() === c.toLowerCase()
                      ? "currentColor"
                      : "transparent",
                }}
                onClick={() => {
                  setPending(c);
                  setPickerKey((k) => k + 1);
                  onConfirm(c);
                }}
              >
                {isUsed && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-foreground/50 text-[6px] flex items-center justify-center text-background leading-none">
                    ●
                  </span>
                )}
              </button>
            );
          })}
        </div>
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

      {/* Opacity slider */}
      {onOpacityChange && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Transparenz</span>
            <span className="font-mono text-xs text-muted-foreground">
              {opacity}%
            </span>
          </div>
          <Slider
            min={10}
            max={100}
            step={5}
            value={[opacity]}
            onValueChange={(values) => {
              const v = Array.isArray(values) ? values[0] : values;
              setOpacity(v);
              onOpacityChange(v);
            }}
          />
        </div>
      )}

      <Button size="sm" className="w-full" onClick={() => onConfirm(pending)}>
        Farbe übernehmen
      </Button>
    </div>
  );
}

export const LayerListItem = memo(function LayerListItem({
  layer,
  activeLayerId,
  isLayerSwitchPending = false,
  duplicateCount = 0,
  editingLayerId,
  editingLayerName,
  editLayerInputRef,
  onSelect,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onEditNameChange,
  onColorChange,
  onOpacityChange,
  onDelete,
  onDuplicateLayer,
  onToggleVisibility,
  onSoloLayer,
  onRemovePostalCode,
  onMovePlz,
  otherLayers = [],
  onImportCSV,
  onNotesChange,
  isSelected,
  onToggleSelect,
  dragHandleProps,
  isLocked = false,
  onToggleLock,
  onPreviewPostalCode,
  onZoomToLayer,
  onClearPLZ,
  onAddPlzRange,
  allCodesSet,
  onBulkMovePlz,
  onBulkRemovePlz,
  onExportCSV,
  onSplitLayer,
  onCompareLayer,
  onSetGroup,
  existingGroups = [],
  onCopyToArea,
  onMergeLayer,
  layerIndex,
  maxLayerPLZ,
  onHighlightCodes,
}: LayerListItemProps) {
  const isOptimistic = layer.id > 1_000_000_000;
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [splitPopoverOpen, setSplitPopoverOpen] = useState(false);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [newGroupInput, setNewGroupInput] = useState("");
  const [codesExpanded, setCodesExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesValue, setNotesValue] = useState(layer.notes ?? "");
  const [codeSearch, setCodeSearch] = useState("");
  const [rangeInput, setRangeInput] = useState("");
  const [rangeInputVisible, setRangeInputVisible] = useState(false);
  const [plzSelectMode, setPlzSelectMode] = useState(false);
  const [selectedPlzCodes, setSelectedPlzCodes] = useState<Set<string>>(
    new Set()
  );
  type HistoryRow = {
    changeType: string;
    createdAt: string;
    createdBy: string | null;
    isUndone: string;
    postalCodeCount: number;
    sampleCodes: string[] | null;
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await getLayerHistoryAction(layer.id);
      if (res.success) setHistoryItems(res.data);
    } finally {
      setHistoryLoading(false);
    }
  }, [layer.id]);
  const isVisible = layer.isVisible !== "false";
  const currentOpacity = layer.opacity ?? 70;
  const postalCodes = layer.postalCodes ?? [];

  const filteredCodes = useMemo(() => {
    const q = codeSearch.trim();
    if (!q) return postalCodes;
    return postalCodes.filter((pc) => pc.postalCode.includes(q));
  }, [postalCodes, codeSearch]);

  const prefixDistribution = useMemo(() => {
    if (postalCodes.length < 3) return [];
    const map = new Map<string, number>();
    for (const pc of postalCodes) {
      const prefix = pc.postalCode.slice(0, 2);
      map.set(prefix, (map.get(prefix) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [postalCodes]);

  const existingCodesSet = useMemo(
    () => new Set(postalCodes.map((pc) => pc.postalCode)),
    [postalCodes]
  );

  const handleAddRange = () => {
    if (!onAddPlzRange || !allCodesSet) return;
    const raw = rangeInput.trim();
    if (!raw) return;

    const newCodes: string[] = [];

    for (const part of raw.split(/[,;\s]+/)) {
      const segment = part.trim();
      if (!segment) continue;

      const dashMatch = /^(\d{4,5})-(\d{4,5})$/.exec(segment);
      if (dashMatch) {
        const from = Number.parseInt(dashMatch[1], 10);
        const to = Number.parseInt(dashMatch[2], 10);
        for (let n = from; n <= to; n++) {
          const code = n.toString().padStart(dashMatch[1].length, "0");
          if (allCodesSet.has(code) && !existingCodesSet.has(code)) {
            newCodes.push(code);
          }
        }
      } else if (/^\d{2,4}$/.test(segment)) {
        // prefix match
        for (const code of allCodesSet) {
          if (code.startsWith(segment) && !existingCodesSet.has(code)) {
            newCodes.push(code);
          }
        }
      } else if (/^\d{5}$/.test(segment)) {
        if (allCodesSet.has(segment) && !existingCodesSet.has(segment)) {
          newCodes.push(segment);
        }
      }
    }

    if (newCodes.length === 0) {
      toast.warning("Keine passenden PLZ gefunden");
      return;
    }

    onAddPlzRange(layer.id, newCodes);
    toast.success(`${newCodes.length} PLZ hinzugefügt`);
    setRangeInput("");
    setRangeInputVisible(false);
  };

  return (
    <div
      className={cn(
        "group relative rounded-md border transition-all",
        activeLayerId === layer.id
          ? "border-primary bg-accent shadow-sm"
          : "border-border hover:border-primary/50 hover:bg-accent/50",
        isOptimistic && "opacity-60 pointer-events-none",
        !isVisible && "opacity-50",
        isLocked && "ring-1 ring-amber-400/50"
      )}
      onMouseEnter={() => {
        if (onHighlightCodes && postalCodes.length > 0) {
          onHighlightCodes(new Set(postalCodes.map((pc) => pc.postalCode)));
        }
      }}
      onMouseLeave={() => onHighlightCodes?.(null)}
    >
      <div
        role="button"
        tabIndex={0}
        className="px-2 py-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-md"
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
          } else if (e.key === "F2") {
            e.preventDefault();
            if (!isOptimistic) {
              onStartEdit(layer.id, layer.name);
            }
          }
        }}
      >
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Select checkbox — shown in select mode */}
            {onToggleSelect !== undefined && (
              <button
                type="button"
                className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                aria-label="Gebiet auswählen"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(layer.id);
                }}
              >
                {isSelected ? (
                  <CheckSquare className="h-3 w-3 text-primary" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
              </button>
            )}
            {/* Drag handle — shown when draggable */}
            {dragHandleProps && (
              <button
                type="button"
                className="shrink-0 p-0.5 rounded cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                aria-label="Gebiet verschieben"
                onClick={(e) => e.stopPropagation()}
                {...dragHandleProps}
              >
                <GripVertical className="h-3 w-3" />
              </button>
            )}
            {/* Visibility toggle — always visible */}
            {onToggleVisibility && (
              <button
                type="button"
                className={cn(
                  "shrink-0 p-0.5 rounded hover:bg-muted transition-colors",
                  !isVisible && "text-muted-foreground"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(layer.id, !isVisible);
                }}
                title={isVisible ? "Ausblenden" : "Einblenden"}
              >
                {isVisible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              className="w-2.5 h-2.5 rounded-sm shrink-0 border border-border hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
              style={{ backgroundColor: layer.color }}
              title="Farbe ändern"
              onClick={(e) => {
                e.stopPropagation();
                setColorPickerOpen(true);
              }}
            />
            {editingLayerId === layer.id ? (
              <Input
                ref={editLayerInputRef}
                value={editingLayerName}
                onChange={(e) => onEditNameChange(e.target.value)}
                maxLength={31}
                className="h-5 text-xs flex-1"
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
                className="text-xs font-medium truncate"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onStartEdit(layer.id, layer.name);
                }}
                title="Doppelklick zum Umbenennen"
              >
                {layerIndex !== undefined && layerIndex < 9 && (
                  <span className="inline-block mr-1 text-[9px] font-mono text-muted-foreground/60 select-none">
                    {`F${layerIndex + 1}`}
                  </span>
                )}
                {layer.name}
              </span>
            )}
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
              {layer.postalCodes?.length ?? 0}
            </Badge>
            {allCodesSet &&
              allCodesSet.size > 0 &&
              (layer.postalCodes?.length ?? 0) > 0 && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="flex items-center gap-0.5 cursor-default" />
                    }
                  >
                    <span
                      className="inline-block h-1.5 rounded-full bg-current opacity-40"
                      style={{
                        backgroundColor: layer.color,
                        opacity: 0.7,
                        width: `${Math.max(8, Math.round(((layer.postalCodes?.length ?? 0) / allCodesSet.size) * 48))}px`,
                      }}
                    />
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      {(
                        ((layer.postalCodes?.length ?? 0) / allCodesSet.size) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {layer.postalCodes?.length ?? 0} von {allCodesSet.size}{" "}
                      PLZ (
                      {(
                        ((layer.postalCodes?.length ?? 0) / allCodesSet.size) *
                        100
                      ).toFixed(1)}
                      %)
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            {duplicateCount > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500/15 text-amber-600 border-0 gap-0.5" />
                  }
                >
                  <TriangleAlert className="h-2.5 w-2.5" />
                  {duplicateCount}
                </TooltipTrigger>
                <TooltipContent>
                  <p>{duplicateCount} PLZ in mehreren Gebieten</p>
                </TooltipContent>
              </Tooltip>
            )}
            {isLayerSwitchPending && activeLayerId === layer.id && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
            )}
            {isLocked && (
              <Lock
                className="h-3 w-3 shrink-0 text-amber-500"
                aria-label="Ebene gesperrt"
              />
            )}
          </div>

          <div
            className={cn(
              "flex items-center gap-0.5 transition-opacity",
              isLocked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            {/* Solo — show only this layer */}
            {onSoloLayer && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSoloLayer(layer.id);
                      }}
                    />
                  }
                >
                  <Focus className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Nur dieses Gebiet anzeigen</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <PopoverTrigger
                      render={
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => e.stopPropagation()}
                        />
                      }
                    />
                  }
                >
                  <IconPalette className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Farbe ändern</p>
                </TooltipContent>
              </Tooltip>
              <PopoverContent
                className="w-auto p-3"
                onClick={(e) => e.stopPropagation()}
              >
                <LayerColorPickerContent
                  currentColor={layer.color}
                  currentOpacity={currentOpacity}
                  usedColors={otherLayers.map((l) => l.color)}
                  onConfirm={(hex) => {
                    onColorChange(layer.id, hex);
                    setColorPickerOpen(false);
                  }}
                  onOpacityChange={
                    onOpacityChange
                      ? (opacity) => onOpacityChange(layer.id, opacity)
                      : undefined
                  }
                />
              </PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-5 w-5"
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
                <Copy className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>PLZ als CSV kopieren</p>
              </TooltipContent>
            </Tooltip>

            {onDuplicateLayer && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateLayer(layer.id);
                      }}
                    />
                  }
                >
                  <CopyPlus className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Layer duplizieren</p>
                </TooltipContent>
              </Tooltip>
            )}

            {onCopyToArea && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyToArea(layer.id, layer.name);
                      }}
                    />
                  }
                >
                  <ArrowRightLeft className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>In anderes Gebiet kopieren</p>
                </TooltipContent>
              </Tooltip>
            )}

            {onMergeLayer && otherLayers.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMergeLayer(layer.id, layer.name);
                      }}
                    />
                  }
                >
                  <GitMerge className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mit anderem Layer zusammenführen</p>
                </TooltipContent>
              </Tooltip>
            )}

            {onSplitLayer && postalCodes.length >= 4 && (
              <Popover
                open={splitPopoverOpen}
                onOpenChange={setSplitPopoverOpen}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <PopoverTrigger
                        render={
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      />
                    }
                  >
                    <Scissors className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Layer aufteilen</p>
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  className="w-52 p-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs font-medium mb-2 text-muted-foreground">
                    In wie viele Teile aufteilen?
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {[2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 text-xs"
                        disabled={postalCodes.length < n}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSplitPopoverOpen(false);
                          onSplitLayer(layer.id, n);
                        }}
                      >
                        {n}× (~{Math.ceil(postalCodes.length / n)} PLZ)
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {onCompareLayer && postalCodes.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCompareLayer(layer.id);
                      }}
                    />
                  }
                >
                  <GitCompareArrows className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mit anderem Layer vergleichen</p>
                </TooltipContent>
              </Tooltip>
            )}

            {onSetGroup && (
              <Popover
                open={groupPopoverOpen}
                onOpenChange={setGroupPopoverOpen}
              >
                <Tooltip>
                  <PopoverTrigger
                    render={
                      <TooltipTrigger
                        render={
                          <Button
                            variant={layer.groupName ? "secondary" : "outline"}
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        {layer.groupName ? (
                          <FolderOpen className="h-3 w-3" />
                        ) : (
                          <Folder className="h-3 w-3" />
                        )}
                      </TooltipTrigger>
                    }
                  />
                  <TooltipContent>
                    <p>
                      {layer.groupName
                        ? `Gruppe: ${layer.groupName}`
                        : "Gruppe zuweisen"}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <PopoverContent className="w-52 p-2 space-y-1.5" side="top">
                  <p className="text-xs font-medium text-muted-foreground px-1">
                    Gruppe zuweisen
                  </p>
                  {existingGroups.length > 0 && (
                    <div className="space-y-0.5">
                      {existingGroups.map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={`w-full text-left px-2 py-1 rounded text-xs hover:bg-accent transition-colors flex items-center gap-1.5 ${layer.groupName === g ? "bg-accent font-medium" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetGroup(layer.id, g);
                            setGroupPopoverOpen(false);
                          }}
                        >
                          <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1 pt-0.5">
                    <input
                      className="flex-1 text-xs border rounded px-2 py-1 bg-background min-w-0"
                      placeholder="Neue Gruppe…"
                      value={newGroupInput}
                      onChange={(e) => setNewGroupInput(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter" && newGroupInput.trim()) {
                          onSetGroup(layer.id, newGroupInput.trim());
                          setNewGroupInput("");
                          setGroupPopoverOpen(false);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-6 w-6 shrink-0"
                      disabled={!newGroupInput.trim()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!newGroupInput.trim()) return;
                        onSetGroup(layer.id, newGroupInput.trim());
                        setNewGroupInput("");
                        setGroupPopoverOpen(false);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  {layer.groupName && (
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1 rounded text-xs text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetGroup(layer.id, null);
                        setGroupPopoverOpen(false);
                      }}
                    >
                      Aus Gruppe entfernen
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            )}

            {onClearPLZ && postalCodes.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearPLZ(layer.id);
                      }}
                    />
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Alle PLZ löschen</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(layer.id);
                    }}
                  />
                }
              >
                <X className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Layer löschen</p>
              </TooltipContent>
            </Tooltip>

            {/* Toggle codes list */}
            {postalCodes.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={codesExpanded ? "secondary" : "outline"}
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCodesExpanded((v) => !v);
                        if (codesExpanded) setCodeSearch("");
                      }}
                    />
                  }
                >
                  <List className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {codesExpanded
                      ? "PLZ-Liste schließen"
                      : "PLZ-Liste anzeigen"}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Import CSV */}
            {onImportCSV && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onImportCSV(layer.id);
                      }}
                    />
                  }
                >
                  <Upload className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>PLZ aus CSV/Text importieren</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Export CSV */}
            {onExportCSV && postalCodes.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportCSV(
                          layer.id,
                          layer.name,
                          postalCodes.map((pc) => pc.postalCode)
                        );
                      }}
                    />
                  }
                >
                  <Download className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Als CSV herunterladen</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Notes toggle */}
            {onNotesChange && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={notesExpanded ? "secondary" : "outline"}
                      size="icon"
                      className={cn(
                        "h-5 w-5 relative",
                        layer.notes && "text-amber-600"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotesExpanded((v) => !v);
                      }}
                    />
                  }
                >
                  <StickyNote className="h-3 w-3" />
                  {layer.notes && !notesExpanded && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {layer.notes && !notesExpanded ? (
                    <div className="max-w-[220px]">
                      <p className="font-medium text-xs mb-1">Notiz:</p>
                      <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                        {layer.notes}
                      </p>
                    </div>
                  ) : (
                    <p>
                      {notesExpanded
                        ? "Notizen schließen"
                        : "Notizen bearbeiten"}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Layer activity history */}
            <Popover
              open={historyOpen}
              onOpenChange={(open) => {
                setHistoryOpen(open);
                if (open) loadHistory();
              }}
            >
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => e.stopPropagation()}
                    title="Verlauf dieser Ebene"
                  />
                }
              >
                <History className="h-3 w-3" />
              </PopoverTrigger>
              <PopoverContent
                className="w-72 p-2"
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  Änderungshistorie
                </p>
                {historyLoading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!historyLoading && historyItems.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Keine Änderungen aufgezeichnet
                  </p>
                )}
                {!historyLoading && historyItems.length > 0 && (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {historyItems.map((item, i) => {
                      const isAdd = item.changeType === "add_postal_codes";
                      const codes = Array.isArray(item.sampleCodes)
                        ? (item.sampleCodes as string[])
                        : [];
                      const preview =
                        codes.slice(0, 3).join(", ") +
                        (codes.length > 3 ? ` +${codes.length - 3}` : "");
                      const date = item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "";
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-1.5 text-xs py-1 border-b last:border-0"
                        >
                          <span
                            className={cn(
                              "shrink-0 mt-0.5 font-bold",
                              isAdd ? "text-green-600" : "text-red-500"
                            )}
                          >
                            {isAdd ? "+" : "−"}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="font-medium">
                              {item.postalCodeCount} PLZ
                            </span>
                            {preview && (
                              <span className="text-muted-foreground ml-1 truncate block">
                                {preview}
                              </span>
                            )}
                          </span>
                          <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
                            {date}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Layer lock */}
            {onToggleLock && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={isLocked ? "secondary" : "outline"}
                      size="icon"
                      className={cn(
                        "h-5 w-5",
                        isLocked && "text-amber-600 border-amber-400"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleLock(layer.id);
                      }}
                    />
                  }
                >
                  {isLocked ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <LockOpen className="h-3 w-3" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {isLocked
                      ? "Ebene gesperrt – entsperren?"
                      : "Ebene sperren"}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            {onZoomToLayer && (layer.postalCodes?.length ?? 0) > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onZoomToLayer(layer.id);
                      }}
                    />
                  }
                >
                  <Focus className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Karte auf Ebene fokussieren</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {layer.notes && (
          <Tooltip>
            <TooltipTrigger
              render={
                <p className="text-[10px] text-muted-foreground/70 italic truncate leading-tight mt-0.5 pl-[18px] pr-1 pb-0.5 cursor-default" />
              }
            >
              {layer.notes.split("\n")[0].trim()}
            </TooltipTrigger>
            {layer.notes.length > 60 || layer.notes.includes("\n") ? (
              <TooltipContent className="max-w-64 whitespace-pre-wrap">
                <p>{layer.notes}</p>
              </TooltipContent>
            ) : null}
          </Tooltip>
        )}
        {maxLayerPLZ != null && maxLayerPLZ > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b overflow-hidden"
            aria-hidden
          >
            <div
              className="h-full rounded-b transition-all duration-500"
              style={{
                width: `${Math.round(((layer.postalCodes?.length ?? 0) / maxLayerPLZ) * 100)}%`,
                backgroundColor: layer.color,
                opacity: 0.55,
              }}
            />
          </div>
        )}
      </div>

      {/* Expandable postal codes section */}
      {codesExpanded && postalCodes.length > 0 && (
        <div
          className="px-2 pb-2 border-t mt-0.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {/* PLZ prefix distribution */}
          {prefixDistribution.length > 0 && (
            <div className="mt-1.5 mb-2">
              <div className="text-[9px] text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                Top-Regionen (2-stellig)
              </div>
              <div className="space-y-0.5">
                {prefixDistribution.map(([prefix, count]) => {
                  const pct =
                    postalCodes.length > 0
                      ? (count / postalCodes.length) * 100
                      : 0;
                  return (
                    <div key={prefix} className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] w-6 text-right text-muted-foreground shrink-0">
                        {prefix}x
                      </span>
                      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: layer.color,
                          }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground w-5 text-right shrink-0">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {postalCodes.length > 8 && (
            <div className="relative mt-1.5 mb-1">
              <input
                type="text"
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
                placeholder="PLZ suchen…"
                className="w-full h-6 text-[10px] bg-muted rounded px-2 pr-5 border-0 outline-none focus:ring-1 focus:ring-primary"
              />
              {codeSearch && (
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground"
                  onClick={() => setCodeSearch("")}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          )}
          {/* PLZ bulk select toolbar */}
          {(onBulkMovePlz || onBulkRemovePlz) && postalCodes.length > 1 && (
            <div className="flex items-center justify-between mt-1 mb-0.5">
              <button
                type="button"
                onClick={() => {
                  setPlzSelectMode(!plzSelectMode);
                  setSelectedPlzCodes(new Set());
                }}
                className={cn(
                  "text-[10px] transition-colors",
                  plzSelectMode
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {plzSelectMode
                  ? `${selectedPlzCodes.size} ausgewählt`
                  : "Mehrere auswählen"}
              </button>
              {plzSelectMode && selectedPlzCodes.size > 0 && (
                <div className="flex items-center gap-1">
                  {onBulkMovePlz && otherLayers.length > 0 && (
                    <select
                      className="h-5 text-[10px] bg-muted border-0 rounded px-1 cursor-pointer"
                      defaultValue=""
                      onChange={(e) => {
                        const toId = Number(e.target.value);
                        if (toId) {
                          onBulkMovePlz(layer.id, toId, [...selectedPlzCodes]);
                          setSelectedPlzCodes(new Set());
                          setPlzSelectMode(false);
                        }
                        e.target.value = "";
                      }}
                    >
                      <option value="" disabled>
                        Verschieben nach…
                      </option>
                      {otherLayers.map((ol) => (
                        <option key={ol.id} value={ol.id}>
                          {ol.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {onBulkRemovePlz && (
                    <button
                      type="button"
                      onClick={() => {
                        onBulkRemovePlz(layer.id, [...selectedPlzCodes]);
                        setSelectedPlzCodes(new Set());
                        setPlzSelectMode(false);
                      }}
                      className="h-5 px-1.5 text-[10px] bg-destructive/10 text-destructive rounded hover:bg-destructive/20 transition-colors"
                    >
                      Entfernen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPlzCodes(
                        new Set(filteredCodes.map((c) => c.postalCode))
                      )
                    }
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Alle
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto mt-1">
            {filteredCodes.length === 0 ? (
              <p className="text-[10px] text-muted-foreground w-full text-center py-1">
                Keine PLZ gefunden
              </p>
            ) : (
              filteredCodes.map((pc) => (
                <span
                  key={pc.postalCode}
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[10px] rounded px-1.5 py-0.5 leading-none group/badge cursor-pointer transition-colors",
                    plzSelectMode && selectedPlzCodes.has(pc.postalCode)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                  onClick={
                    plzSelectMode
                      ? () => {
                          const next = new Set(selectedPlzCodes);
                          if (next.has(pc.postalCode))
                            next.delete(pc.postalCode);
                          else next.add(pc.postalCode);
                          setSelectedPlzCodes(next);
                        }
                      : undefined
                  }
                  onMouseEnter={() =>
                    !plzSelectMode && onPreviewPostalCode?.(pc.postalCode)
                  }
                  onMouseLeave={() =>
                    !plzSelectMode && onPreviewPostalCode?.(null)
                  }
                  role={plzSelectMode ? "checkbox" : undefined}
                  aria-checked={
                    plzSelectMode
                      ? selectedPlzCodes.has(pc.postalCode)
                      : undefined
                  }
                >
                  {pc.postalCode}
                  {!plzSelectMode && onMovePlz && otherLayers.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div className="relative inline-flex opacity-0 group-hover/badge:opacity-100 transition-opacity" />
                        }
                      >
                        <select
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          defaultValue=""
                          onChange={(e) => {
                            const toId = Number(e.target.value);
                            if (toId) onMovePlz(layer.id, toId, pc.postalCode);
                            e.target.value = "";
                          }}
                          title={`PLZ ${pc.postalCode} verschieben`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="" disabled>
                            Verschieben nach…
                          </option>
                          {otherLayers.map((ol) => (
                            <option key={ol.id} value={ol.id}>
                              {ol.name}
                            </option>
                          ))}
                        </select>
                        <ArrowRightLeft className="h-2 w-2 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>PLZ verschieben</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {!plzSelectMode && onRemovePostalCode && (
                    <button
                      type="button"
                      className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                      onClick={() =>
                        onRemovePostalCode(layer.id, pc.postalCode)
                      }
                      aria-label={`PLZ ${pc.postalCode} entfernen`}
                    >
                      <X className="h-2 w-2" />
                    </button>
                  )}
                </span>
              ))
            )}
          </div>
          {/* PLZ range input */}
          {onAddPlzRange && allCodesSet && (
            <div className="mt-1.5">
              {rangeInputVisible ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddRange();
                      if (e.key === "Escape") {
                        setRangeInputVisible(false);
                        setRangeInput("");
                      }
                    }}
                    placeholder="z.B. 10115-10179, 20, 30001"
                    className="flex-1 h-6 text-[10px] bg-muted rounded px-2 border-0 outline-none focus:ring-1 focus:ring-primary"
                    // biome-ignore lint/a11y/noAutofocus: intentional focus on show
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddRange}
                    className="h-6 px-1.5 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                  >
                    Hinzufügen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRangeInputVisible(false);
                      setRangeInput("");
                    }}
                    className="p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRangeInputVisible(true)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-2.5 w-2.5" />
                  PLZ-Bereich hinzufügen
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {/* Notes section */}
      {notesExpanded && onNotesChange && (
        <div
          className="px-2 pb-2 border-t mt-0.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <textarea
            className="w-full mt-1.5 min-h-[60px] max-h-40 text-[11px] bg-muted rounded px-2 py-1.5 border-0 outline-none focus:ring-1 focus:ring-primary resize-y placeholder:text-muted-foreground/60 leading-relaxed"
            placeholder="Notizen hinzufügen…"
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            onBlur={() => onNotesChange(layer.id, notesValue)}
          />
        </div>
      )}
    </div>
  );
});
