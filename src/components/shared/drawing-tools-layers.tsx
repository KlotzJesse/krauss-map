"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconClock,
  IconDeviceFloppy,
  IconDots,
  IconGitMerge,
  IconLayoutColumns,
  IconPlus,
} from "@tabler/icons-react";
import {
  ArrowDownUp,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Folder,
  MapPin,
  Palette,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { memo } from "react";
import type { Dispatch, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import {
  fixDuplicateCodeAction,
  fixDuplicateWithLayerAction,
  addPostalCodesByPrefixAction,
} from "@/app/actions/area-actions";
import { LayerListItem } from "@/components/shared/layer-list-item";
import { LayerTemplatesDialog } from "@/components/areas/layer-templates-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  detectCountryFromCode,
  formatWithPrefix,
} from "@/lib/config/countries";
import { useLayerFormState } from "@/lib/hooks/use-layer-form-state";
import { useLockedLayers } from "@/lib/hooks/use-locked-layers";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { Layer } from "@/lib/types/area-types";
import { extractRawCode, storedCodeToCompositeKey } from "@/lib/utils/deck-gl-utils";
import {
  COLOR_THEMES,
  hashGroupColor,
  reassignAllColors,
} from "@/lib/utils/layer-colors";
import type { DrawingToolsProps } from "./drawing-tools";
import type { DrawingToolsUIState, DrawingToolsUIAction } from "./drawing-tools";

// Stable DnD config — defined outside components to avoid re-renders on each render cycle
const DND_MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 5 } };
const EMPTY_ARRAY: never[] = [];

type SortableLayerListItemProps = React.ComponentProps<typeof LayerListItem>;

const SortableLayerListItem = memo(function SortableLayerListItem({
  layer,
  ...props
}: SortableLayerListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <LayerListItem
        layer={layer}
        dragHandleProps={
          {
            ...attributes,
            ...listeners,
          } as React.HTMLAttributes<HTMLButtonElement>
        }
        {...props}
      />
    </div>
  );
});

export interface LayerManagementSectionProps {
  areaId: number;
  optimisticLayers: Layer[];
  ui: DrawingToolsUIState;
  dispatchUI: Dispatch<DrawingToolsUIAction>;
  form: ReturnType<typeof useLayerFormState>["state"];
  dispatchForm: ReturnType<typeof useLayerFormState>["dispatch"];
  editLayerInputRef: RefObject<HTMLInputElement | null>;
  activeLayerId: number | null | undefined;
  isViewingVersion: boolean;
  isLayerSwitchPending?: boolean;
  onLayerSelect: DrawingToolsProps["onLayerSelect"];
  handleCreateLayer: () => void;
  handleRenameLayer: (layerId: number, newName: string) => void;
  handleColorChange: (layerId: number, color: string) => void;
  handleOpacityChange: (layerId: number, opacity: number) => void;
  handleDeleteLayer: (layerId: number) => void;
  handleDuplicateLayer: (layerId: number) => void;
  handleSplitLayer?: (layerId: number, splitCount: number) => void;
  handleOpenCopyToArea: (layerId: number, layerName: string) => void;
  handleOpenMergeLayers: (layerId: number, layerName: string) => void;
  handleToggleVisibility: (layerId: number, visible: boolean) => void;
  handleSoloLayer: (layerId: number) => void;
  handleShowAllLayers: () => void;
  handleReassignColors: (theme?: string) => void;
  handleReorderLayers: (oldIndex: number, newIndex: number) => void;
  handleSortByCount: () => void;
  handleRemovePostalCodeFromLayer?: (
    layerId: number,
    postalCode: string
  ) => void;
  handleMovePlz?: (
    fromLayerId: number,
    toLayerId: number,
    postalCode: string
  ) => void;
  handleNotesChange?: (layerId: number, notes: string) => void;
  handleSetLayerGroup?: (layerId: number, groupName: string | null) => void;
  handleClearLayerPLZ?: (layerId: number) => void;
  handleBulkDelete: (layerIds: number[]) => void;
  handleBulkVisibility: (layerIds: number[], visible: boolean) => void;
  handleBulkMovePlz?: (
    fromLayerId: number,
    toLayerId: number,
    codes: string[]
  ) => void;
  handleBulkRemovePlz?: (layerId: number, codes: string[]) => void;
  addPostalCodesToLayer?: (layerId: number, codes: string[]) => Promise<void>;
  onOpenConflicts?: () => void;
  onPreviewPostalCode?: (postalCode: string | null) => void;
  onZoomToLayer?: (layerId: number) => void;
  plzFindInputRef?: React.RefObject<HTMLInputElement | null>;
  newLayerInputRef?: React.RefObject<HTMLInputElement | null>;
  showNewLayerInputRef?: React.RefObject<((show: boolean) => void) | null>;
  allCodesSet?: Set<string>;
  getAllCodesSet?: () => Set<string>;
  activeCodesTotal?: number;
  onLayerUpdate?: () => void;
  onHighlightCodes?: (codes: Set<string> | null) => void;
  handleExportLayerCSV?: (
    layerId: number,
    layerName: string,
    codes: string[]
  ) => void;
}

export const LayerManagementSection = memo(function LayerManagementSection({
  areaId,
  optimisticLayers,
  ui,
  dispatchUI,
  form,
  dispatchForm,
  editLayerInputRef,
  activeLayerId,
  isViewingVersion,
  isLayerSwitchPending = false,
  onLayerSelect,
  handleCreateLayer,
  handleRenameLayer,
  handleColorChange,
  handleOpacityChange,
  handleDeleteLayer,
  handleDuplicateLayer,
  handleSplitLayer,
  handleOpenCopyToArea,
  handleOpenMergeLayers,
  handleToggleVisibility,
  handleSoloLayer,
  handleShowAllLayers,
  handleReassignColors,
  handleReorderLayers,
  handleSortByCount,
  handleRemovePostalCodeFromLayer,
  handleMovePlz,
  handleNotesChange,
  handleSetLayerGroup,
  handleClearLayerPLZ,
  handleBulkDelete,
  handleBulkVisibility,
  handleBulkMovePlz,
  handleBulkRemovePlz,
  addPostalCodesToLayer,
  onOpenConflicts,
  onPreviewPostalCode,
  onZoomToLayer,
  plzFindInputRef: externalPlzFindInputRef,
  newLayerInputRef: externalNewLayerInputRef,
  showNewLayerInputRef,
  allCodesSet,
  getAllCodesSet,
  activeCodesTotal,
  onLayerUpdate,
  onHighlightCodes,
  handleExportLayerCSV,
}: LayerManagementSectionProps) {
  const { isLocked, toggleLock } = useLockedLayers(areaId);

  // Stabilize dispatch callbacks to prevent Button/TooltipTrigger re-renders
  const handleOpenConflicts = useCallback(
    () => onOpenConflicts?.(),
    [onOpenConflicts]
  );
  const handleOpenHistory = useCallback(
    () => dispatchUI({ type: "OPEN_HISTORY" }),
    [dispatchUI]
  );
  const handleOpenVersion = useCallback(
    () => dispatchUI({ type: "OPEN_VERSION" }),
    [dispatchUI]
  );
  const handleOpenMerge = useCallback(
    () => dispatchUI({ type: "OPEN_MERGE" }),
    [dispatchUI]
  );
  const handleSetLayersOpen = useCallback(
    (open: boolean) => {
      dispatchUI({ type: "SET_LAYERS_OPEN", open });
      try {
        const saved = localStorage.getItem("drawing-tools-ui");
        const prev = saved ? JSON.parse(saved) : {};
        localStorage.setItem(
          "drawing-tools-ui",
          JSON.stringify({ ...prev, layersOpen: open })
        );
      } catch {
        /* ignore */
      }
    },
    [dispatchUI]
  );

  // Lock-guarded wrappers — no-op when the target layer is locked
  const guardedRemovePostalCode = useStableCallback(
    (layerId: number, postalCode: string) => {
      if (isLocked(layerId)) {
        toast.warning("Ebene ist gesperrt — PLZ entfernen nicht möglich");
        return;
      }
      handleRemovePostalCodeFromLayer?.(layerId, postalCode);
    }
  );
  const guardedImportCSV = useStableCallback((layerId: number) => {
    if (isLocked(layerId)) {
      toast.warning("Ebene ist gesperrt — Import nicht möglich");
      return;
    }
    openImportDialog(layerId);
  });
  const handleNewLayerNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) =>
      dispatchForm({ type: "SET_NEW_NAME", name: e.target.value }),
    [dispatchForm]
  );
  const handleNewLayerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleCreateLayer();
      }
    },
    [handleCreateLayer]
  );

  const hasHiddenLayers = optimisticLayers.some((l) => l.isVisible === "false");
  const [layerSearch, setLayerSearch] = useState("");
  const [layerSortMode, setLayerSortMode] = useState<
    "default" | "name" | "count-desc" | "count-asc"
  >("default");

  const optimisticLayersRef = useRef(optimisticLayers);
  optimisticLayersRef.current = optimisticLayers;

  const [showDuplicates, setShowDuplicates] = useState(false);
  const filteredLayers = useMemo(() => {
    const q = layerSearch.trim().toLowerCase();
    let result = q
      ? optimisticLayers.filter((l) => l.name.toLowerCase().includes(q))
      : [...optimisticLayers];
    if (layerSortMode === "name") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name, "de"));
    } else if (layerSortMode === "count-desc") {
      result = [...result].sort(
        (a, b) => (b.postalCodes?.length ?? 0) - (a.postalCodes?.length ?? 0)
      );
    } else if (layerSortMode === "count-asc") {
      result = [...result].sort(
        (a, b) => (a.postalCodes?.length ?? 0) - (b.postalCodes?.length ?? 0)
      );
    }
    return result;
  }, [optimisticLayers, layerSearch, layerSortMode]);

  const isDragDisabled = !!layerSearch.trim() || layerSortMode !== "default";

  // PLZ quick-find: search which layer(s) contain a given code
  const [plzFindQuery, setPlzFindQuery] = useState("");
  const internalPlzFindInputRef = useRef<HTMLInputElement | null>(null);
  const plzFindInputRef = externalPlzFindInputRef ?? internalPlzFindInputRef;
  const internalNewLayerInputRef = useRef<HTMLInputElement | null>(null);
  const newLayerInputRef = externalNewLayerInputRef ?? internalNewLayerInputRef;
  const plzFindResults = useMemo(() => {
    const q = plzFindQuery.trim().replace(/\D/g, "");
    if (q.length < 2) return null;
    return optimisticLayers
      .filter((l) => l.postalCodes?.some((pc) => pc.postalCode.startsWith(q)))
      .map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        matchingCodes: (l.postalCodes ?? [])
          .filter((pc) => pc.postalCode.startsWith(q))
          .map((pc) => pc.postalCode)
          .slice(0, 5),
      }));
  }, [plzFindQuery, optimisticLayers]);

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // New layer input visibility — hidden by default, toggled by + button
  const [showNewLayerInput, setShowNewLayerInput] = useState(false);
  // Expose setter via ref so DrawingTools keyboard handler can trigger it
  useEffect(() => {
    if (showNewLayerInputRef)
      showNewLayerInputRef.current = setShowNewLayerInput;
  }, [showNewLayerInputRef]);
  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }, []);
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredLayers.map((l) => l.id)));
  }, [filteredLayers]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const handleBulkDeleteSelected = useCallback(() => {
    const ids = [...selectedIds];
    clearSelection();
    setSelectMode(false);
    handleBulkDelete(ids);
  }, [selectedIds, clearSelection, handleBulkDelete]);
  const handleBulkShowSelected = useCallback(() => {
    handleBulkVisibility([...selectedIds], true);
  }, [selectedIds, handleBulkVisibility]);
  const handleBulkHideSelected = useCallback(() => {
    handleBulkVisibility([...selectedIds], false);
  }, [selectedIds, handleBulkVisibility]);
  const handleBulkAssignGroup = useCallback(
    (groupName: string | null) => {
      for (const id of selectedIds) {
        handleSetLayerGroup?.(id, groupName);
      }
    },
    [selectedIds, handleSetLayerGroup]
  );
  const [bulkGroupPopoverOpen, setBulkGroupPopoverOpen] = useState(false);

  // CSV import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importTargetLayerId, setImportTargetLayerId] = useState<number | null>(
    null
  );
  const [importText, setImportText] = useState("");
  const [importPending, setImportPending] = useState(false);

  // PLZ range/prefix add state
  const [prefixInput, setPrefixInput] = useState("");
  const prefixMatches = useMemo(() => {
    const raw = prefixInput.trim().replace(/\s/g, "");
    if (!raw || !allCodesSet || allCodesSet.size === 0) return null;
    // Support: "80", "8", "80-89", "8-9" (prefix ranges)
    const rangeMatch = raw.match(/^(\d{1,4})-(\d{1,4})$/);
    if (rangeMatch) {
      const [, fromStr, toStr] = rangeMatch;
      const len = Math.max(fromStr.length, toStr.length);
      const from = Number.parseInt(fromStr.padEnd(len, "0"), 10);
      const to = Number.parseInt(toStr.padEnd(len, "9"), 10);
      return [...allCodesSet].filter((c) => {
        const prefix = Number.parseInt(c.slice(0, len), 10);
        return prefix >= from && prefix <= to;
      });
    }
    // Single prefix
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 1 || digits.length > 4) return null;
    return [...allCodesSet].filter((c) => c.startsWith(digits));
  }, [prefixInput, allCodesSet]);

  const handleAddByPrefix = useCallback(async () => {
    if (!addPostalCodesToLayer || !activeLayerId || !prefixMatches?.length)
      return;
    // Filter out already-assigned codes from active layer
    const activeLayer = optimisticLayersRef.current.find(
      (l) => l.id === activeLayerId
    );
    const existing = new Set(
      activeLayer?.postalCodes?.map((pc) => pc.postalCode) ?? []
    );
    const toAdd = prefixMatches.filter((c) => !existing.has(c));
    if (toAdd.length === 0) {
      toast.info("Alle PLZ bereits in dieser Ebene");
      return;
    }
    await addPostalCodesToLayer(activeLayerId, toAdd);
    toast.success(`${toAdd.length} PLZ hinzugefügt`);
    setPrefixInput("");
  }, [addPostalCodesToLayer, activeLayerId, prefixMatches]);

  // Sync prefix matches to map highlight
  useEffect(() => {
    if (!onHighlightCodes) return;
    if (prefixMatches && prefixMatches.length > 0) {
      onHighlightCodes(new Set(prefixMatches));
    } else {
      onHighlightCodes(null);
    }
    return () => onHighlightCodes(null);
  }, [prefixMatches, onHighlightCodes]);

  // Layer templates dialog
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);

  // Layer diff/compare dialog
  const [diffDialog, setDiffDialog] = useState<{
    open: boolean;
    layerAId: number | null;
    layerBId: number | null;
  }>({ open: false, layerAId: null, layerBId: null });

  // Layer groups — collapsed state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const [editingGroupValue, setEditingGroupValue] = useState("");
  const toggleGroupCollapse = useCallback((groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  const handleRenameGroup = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName || !handleSetLayerGroup) return;
      const toUpdate = optimisticLayersRef.current.filter(
        (l) => l.groupName === oldName
      );
      for (const layer of toUpdate) {
        handleSetLayerGroup(layer.id, trimmed);
      }
    },
    [handleSetLayerGroup]
  );

  const handleToggleGroupVisibility = useCallback(
    (groupName: string) => {
      const groupLayers = optimisticLayersRef.current.filter(
        (l) => l.groupName === groupName
      );
      const allVisible = groupLayers.every((l) => l.isVisible !== "false");
      for (const layer of groupLayers) {
        handleToggleVisibility(layer.id, !allVisible);
      }
    },
    [handleToggleVisibility]
  );

  // Group layers by groupName; null/empty = ungrouped (shown last)
  const groupedLayers = useMemo(() => {
    const groups = new Map<string | null, typeof filteredLayers>();
    for (const layer of filteredLayers) {
      const key = layer.groupName ?? null;
      const existing = groups.get(key);
      if (existing) existing.push(layer);
      else groups.set(key, [layer]);
    }
    // Sort: named groups first (alphabetically), then ungrouped
    const sorted: Array<{
      name: string | null;
      layers: typeof filteredLayers;
    }> = [];
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    });
    for (const key of keys) {
      sorted.push({ name: key, layers: groups.get(key)! });
    }
    return sorted;
  }, [filteredLayers]);

  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const layer of optimisticLayers) {
      if (layer.groupName) groups.add(layer.groupName);
    }
    return [...groups].sort();
  }, [optimisticLayers]);

  const maxLayerPLZ = useMemo(
    () =>
      optimisticLayers.reduce(
        (max, l) => Math.max(max, l.postalCodes?.length ?? 0),
        0
      ),
    [optimisticLayers]
  );

  // PLZ cross-layer finder: when search looks like a postal code (with or without prefix)
  const plzSearchResults = useMemo(() => {
    const q = layerSearch.trim();
    if (!/^(D|A|CH|DE|AT)?-?\d{1,5}$/.test(q)) return null;

    const arePostalCodesEquivalent = (leftCode: string, rightCode: string) => {
      const leftComposite = storedCodeToCompositeKey(leftCode);
      const rightComposite = storedCodeToCompositeKey(rightCode);
      if (leftComposite && rightComposite) {
        return leftComposite === rightComposite;
      }
      if (!leftComposite && !rightComposite) {
        return extractRawCode(leftCode) === extractRawCode(rightCode);
      }
      return extractRawCode(leftCode) === extractRawCode(rightCode);
    };
    const normalizedQ = extractRawCode(q);
    if (normalizedQ.length < 1) return null;

    return optimisticLayers
      .filter((l) =>
        l.postalCodes?.some(
          (pc) => arePostalCodesEquivalent(pc.postalCode, q)
        )
      )
      .map((l) => ({ id: l.id, name: l.name, color: l.color ?? "#6366f1" }));
  }, [layerSearch, optimisticLayers]);

  // Group export: combine all PLZ in a group into one CSV
  const handleExportGroupCSV = useCallback(
    (groupName: string) => {
      const groupLayers = optimisticLayers.filter(
        (l) => l.groupName === groupName
      );
      const allCodes = new Set<string>();
      const rows: string[][] = [["PLZ", "Gebiet", "Gruppe"]];
      for (const layer of groupLayers) {
        for (const pc of layer.postalCodes ?? []) {
          if (!allCodes.has(pc.postalCode)) {
            allCodes.add(pc.postalCode);
            rows.push([pc.postalCode, layer.name, groupName]);
          }
        }
      }
      const csv = rows.map((r) => r.join(";")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gruppe-${groupName.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [optimisticLayers]
  );

  const openDiffDialog = useCallback(
    (layerId: number) => {
      const other = optimisticLayers.find((l) => l.id !== layerId);
      setDiffDialog({
        open: true,
        layerAId: layerId,
        layerBId: other?.id ?? null,
      });
    },
    [optimisticLayers]
  );

  const openImportDialog = useCallback((layerId: number) => {
    setImportTargetLayerId(layerId);
    setImportText("");
    setImportDialogOpen(true);
  }, []);

  const handleImportCSV = useCallback(async () => {
    if (!addPostalCodesToLayer || !importTargetLayerId) return;
    const codes = importText
      .split(/[\s,;|\n\r]+/)
      .map((s) => {
        const trimmed = s.trim();
        const detected = detectCountryFromCode(trimmed);
        if (detected.country)
          return formatWithPrefix(detected.code, detected.country);
        // Pure numeric: keep as-is and let addPostalCodesToLayerAction resolve country
        return detected.code.length >= 2 && detected.code.length <= 5
          ? detected.code
          : "";
      })
      .filter((s) => s.length >= 2);
    const unique = [...new Set(codes)];
    if (unique.length === 0) {
      toast.error("Keine gültigen PLZ gefunden");
      return;
    }
    setImportPending(true);
    try {
      await addPostalCodesToLayer(importTargetLayerId, unique);
      toast.success(`${unique.length} PLZ importiert`);
      setImportDialogOpen(false);
    } catch {
      toast.error("Importfehler");
    } finally {
      setImportPending(false);
    }
  }, [addPostalCodesToLayer, importTargetLayerId, importText]);

  const handleImportFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const raw = String(ev.target?.result ?? "");
        // Detect GeoJSON: extract postal code properties
        const isJsonFile =
          file.name.endsWith(".json") || file.name.endsWith(".geojson");
        if (isJsonFile) {
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const features =
              parsed.type === "FeatureCollection" &&
              Array.isArray(parsed.features)
                ? (parsed.features as {
                    properties?: Record<string, unknown>;
                  }[])
                : parsed.type === "Feature"
                  ? [parsed as { properties?: Record<string, unknown> }]
                  : null;
            if (features) {
              const codes = features
                .map((f) => {
                  const p = f.properties ?? {};
                  const rawVal =
                    p.postal_code ??
                    p.postcode ??
                    p.plz ??
                    p.PLZ ??
                    p.code ??
                    p.zip ??
                    "";
                  const s = String(rawVal).trim();
                  const detected = detectCountryFromCode(s);
                  if (detected.country)
                    return formatWithPrefix(detected.code, detected.country);
                  return detected.code.length >= 2 && detected.code.length <= 5
                    ? detected.code
                    : "";
                })
                .filter((c) => c.length >= 2);
              if (codes.length > 0) {
                setImportText((prev) =>
                  prev ? `${prev}\n${codes.join("\n")}` : codes.join("\n")
                );
                e.target.value = "";
                return;
              }
            }
          } catch {
            // Not valid JSON — fall through to text import
          }
        }
        setImportText((prev) => (prev ? `${prev}\n${raw}` : raw));
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  const sensors = useSensors(useSensor(PointerSensor, POINTER_SENSOR_OPTIONS));

  // Stable layerIds: only returns a new array when IDs or order actually changes.
  // Prevents SortableContext from broadcasting updates on visibility/color changes,
  // which would cascade re-renders to all 17 useSortable subscribers.
  const layerIdsPrevRef = useRef<number[]>([]);
  const layerIds = useMemo(() => {
    const next = optimisticLayers.map((l) => l.id);
    const prev = layerIdsPrevRef.current;
    if (next.length === prev.length && next.every((id, i) => id === prev[i])) {
      return prev;
    }
    layerIdsPrevRef.current = next;
    return next;
  }, [optimisticLayers]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const layers = optimisticLayersRef.current;
      const oldIndex = layers.findIndex((l) => l.id === active.id);
      const newIndex = layers.findIndex((l) => l.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        handleReorderLayers(oldIndex, newIndex);
      }
    },
    [handleReorderLayers]
  );

  // Stable otherLayersMap: reuses array references when id/name/color haven't changed.
  // Without this, every optimisticLayers update (e.g. visibility toggle) creates new
  // arrays that defeat memo() on SortableLayerListItem for unchanged layers.
  const otherLayersMapPrevRef = useRef<
    Map<number, { id: number; name: string; color: string }[]>
  >(new Map());
  const otherLayersMap = useMemo(() => {
    const m = new Map<number, { id: number; name: string; color: string }[]>();
    const prev = otherLayersMapPrevRef.current;
    for (const l of optimisticLayers) {
      const newArr = optimisticLayers
        .filter((other) => other.id !== l.id)
        .map((other) => ({
          id: other.id,
          name: other.name,
          color: other.color,
        }));
      const prevArr = prev.get(l.id);
      if (
        prevArr &&
        prevArr.length === newArr.length &&
        prevArr.every(
          (p, i) =>
            p.id === newArr[i].id &&
            p.name === newArr[i].name &&
            p.color === newArr[i].color
        )
      ) {
        m.set(l.id, prevArr);
      } else {
        m.set(l.id, newArr);
      }
    }
    otherLayersMapPrevRef.current = m;
    return m;
  }, [optimisticLayers]);

  // Stable callbacks for LayerListItem to prevent memo() being defeated by inline functions
  const handleLayerStartEdit = useCallback(
    (id: number, name: string) =>
      dispatchForm({ type: "START_EDIT", layerId: id, name }),
    [dispatchForm]
  );
  const handleLayerCancelEdit = useCallback(
    () => dispatchForm({ type: "CANCEL_EDIT" }),
    [dispatchForm]
  );
  const handleLayerEditNameChange = useCallback(
    (name: string) => dispatchForm({ type: "SET_EDIT_NAME", name }),
    [dispatchForm]
  );
  const handleLayerSelect = useCallback(
    (id: number) => {
      if (!selectMode) onLayerSelect?.(id);
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: selectMode is a local state
    [selectMode, onLayerSelect]
  );
  // Stable template currentLayers shape for LayerTemplatesDialog
  const templateCurrentLayers = useMemo(
    () =>
      optimisticLayers.map((l) => ({
        name: l.name,
        color: l.color,
        opacity:
          typeof l.opacity === "number" ? l.opacity : Number(l.opacity ?? 70),
        orderIndex: l.orderIndex,
        notes: l.notes ?? null,
      })),
    [optimisticLayers]
  );
  const handleTemplateApplied = useCallback(
    () => onLayerUpdate?.(),
    [onLayerUpdate]
  );

  // Per-layer duplicate postal code counts + overall stats
  const { duplicateCountByLayer, duplicateCodeMap, layerStats } =
    useMemo(() => {
      const counts = new Map<number, number>();
      const codeToLayers = new Map<string, number[]>();
      let totalCodes = 0;
      let minCode = "";
      let maxCode = "";
      for (const layer of optimisticLayers) {
        if (!layer.postalCodes) continue;
        totalCodes += layer.postalCodes.length;
        for (const pc of layer.postalCodes) {
          const existing = codeToLayers.get(pc.postalCode);
          if (existing) {
            existing.push(layer.id);
          } else {
            codeToLayers.set(pc.postalCode, [layer.id]);
          }
          if (!minCode || pc.postalCode < minCode) minCode = pc.postalCode;
          if (!maxCode || pc.postalCode > maxCode) maxCode = pc.postalCode;
        }
      }
      let duplicateCodeCount = 0;
      for (const [, layerIds] of codeToLayers) {
        if (layerIds.length > 1) {
          duplicateCodeCount++;
          for (const id of layerIds) {
            counts.set(id, (counts.get(id) ?? 0) + 1);
          }
        }
      }

      // PLZ prefix distribution (first 2 digits)
      const prefixCounts = new Map<string, number>();
      for (const [code] of codeToLayers) {
        const prefix = code.slice(0, 2);
        prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
      }
      const prefixDistribution = [...prefixCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([prefix, count]) => ({ prefix, count }));

      return {
        duplicateCountByLayer: counts,
        duplicateCodeMap: new Map(
          [...codeToLayers.entries()].filter(([, ids]) => ids.length > 1)
        ),
        layerStats: {
          uniqueCodes: codeToLayers.size,
          totalCodes,
          duplicateCodes: duplicateCodeCount,
          minCode,
          maxCode,
          prefixDistribution,
        },
      };
    }, [optimisticLayers]);

  // Shared group header renderer — used in both drag-disabled and DnD paths
  const renderGroupHeader = useCallback(
    (gName: string, gLayers: Layer[]) => (
      <div
        key={`group-${gName}`}
        className="flex items-center gap-1 px-1 py-0.5 mt-1 first:mt-0 group/ghdr rounded-sm"
        style={{
          borderLeft: `3px solid ${hashGroupColor(gName)}`,
          paddingLeft: 6,
          backgroundColor: `${hashGroupColor(gName)}14`,
        }}
      >
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-transform"
          style={{
            transform: collapsedGroups.has(gName) ? "" : "rotate(90deg)",
            fontSize: 8,
          }}
          onClick={() => toggleGroupCollapse(gName)}
          aria-label={
            collapsedGroups.has(gName)
              ? "Gruppe aufklappen"
              : "Gruppe zuklappen"
          }
        >
          ▶
        </button>
        <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
        {editingGroupName === gName ? (
          <input
            autoFocus
            className="flex-1 text-xs font-medium border rounded px-1 py-0.5 bg-background min-w-0"
            value={editingGroupValue}
            onChange={(e) => setEditingGroupValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                handleRenameGroup(gName, editingGroupValue);
                setEditingGroupName(null);
              } else if (e.key === "Escape") {
                setEditingGroupName(null);
              }
            }}
            onBlur={() => {
              handleRenameGroup(gName, editingGroupValue);
              setEditingGroupName(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            className="flex-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors truncate"
            onDoubleClick={() => {
              setEditingGroupName(gName);
              setEditingGroupValue(gName);
            }}
            onClick={() => toggleGroupCollapse(gName)}
          >
            {gName}
          </button>
        )}
        <span className="text-[10px] text-muted-foreground/60 shrink-0">
          {gLayers.length}
          {" · "}
          {gLayers.reduce(
            (sum, l) => sum + (l.postalCodes?.length ?? 0),
            0
          )}{" "}
          PLZ
        </span>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/ghdr:opacity-100"
          onClick={() => handleExportGroupCSV(gName)}
          aria-label="Gruppe als CSV exportieren"
          title="Gruppe als CSV exportieren"
        >
          <Download className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/ghdr:opacity-100"
          onClick={() => handleToggleGroupVisibility(gName)}
          aria-label="Gruppe ein-/ausblenden"
        >
          {gLayers.every((l) => l.isVisible !== "false") ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
        </button>
      </div>
    ),
    [
      collapsedGroups,
      editingGroupName,
      editingGroupValue,
      toggleGroupCollapse,
      handleRenameGroup,
      handleExportGroupCSV,
      handleToggleGroupVisibility,
    ]
  );

  // Shared layer item props factory — eliminates duplication between DnD and non-DnD paths
  const getLayerItemProps = useCallback(
    (layer: Layer) => ({
      layer,
      activeLayerId,
      isLayerSwitchPending,
      duplicateCount: duplicateCountByLayer.get(layer.id) ?? 0,
      editingLayerId: form.editingLayerId,
      editingLayerName: form.editingLayerName,
      editLayerInputRef,
      onSelect: handleLayerSelect,
      onStartEdit: handleLayerStartEdit,
      onConfirmEdit: handleRenameLayer,
      onCancelEdit: handleLayerCancelEdit,
      onEditNameChange: handleLayerEditNameChange,
      onColorChange: handleColorChange,
      onOpacityChange: handleOpacityChange,
      onDelete: handleDeleteLayer,
      onDuplicateLayer: handleDuplicateLayer,
      onCopyToArea: handleOpenCopyToArea,
      onMergeLayer:
        (otherLayersMap.get(layer.id)?.length ?? 0) > 0
          ? handleOpenMergeLayers
          : undefined,
      onToggleVisibility: handleToggleVisibility,
      onSoloLayer: handleSoloLayer,
      onRemovePostalCode: guardedRemovePostalCode,
      onImportCSV: addPostalCodesToLayer ? guardedImportCSV : undefined,
      onNotesChange: handleNotesChange,
      onMovePlz: handleMovePlz,
      otherLayers: otherLayersMap.get(layer.id) ?? EMPTY_ARRAY,
      isSelected: selectMode ? selectedIds.has(layer.id) : undefined,
      onToggleSelect: selectMode ? toggleSelect : undefined,
      isLocked: isLocked(layer.id),
      onToggleLock: toggleLock,
      onPreviewPostalCode,
      onZoomToLayer,
      onClearPLZ: handleClearLayerPLZ,
      onAddPlzRange: addPostalCodesToLayer ?? undefined,
      allCodesSetSize: activeCodesTotal ?? allCodesSet?.size ?? 0,
      getAllCodesSet,
      onBulkMovePlz: handleBulkMovePlz,
      onBulkRemovePlz: handleBulkRemovePlz,
      onExportCSV: handleExportLayerCSV,
      onSplitLayer: handleSplitLayer,
      onCompareLayer: openDiffDialog,
      onSetGroup: handleSetLayerGroup,
      existingGroups,
      maxLayerPLZ,
      onHighlightCodes,
    }),
    [
      activeLayerId,
      isLayerSwitchPending,
      duplicateCountByLayer,
      form.editingLayerId,
      form.editingLayerName,
      editLayerInputRef,
      handleLayerSelect,
      handleLayerStartEdit,
      handleRenameLayer,
      handleLayerCancelEdit,
      handleLayerEditNameChange,
      handleColorChange,
      handleOpacityChange,
      handleDeleteLayer,
      handleDuplicateLayer,
      handleOpenCopyToArea,
      handleOpenMergeLayers,
      otherLayersMap,
      handleToggleVisibility,
      handleSoloLayer,
      guardedRemovePostalCode,
      addPostalCodesToLayer,
      guardedImportCSV,
      handleNotesChange,
      handleMovePlz,
      selectMode,
      selectedIds,
      toggleSelect,
      isLocked,
      toggleLock,
      onPreviewPostalCode,
      onZoomToLayer,
      handleClearLayerPLZ,
      activeCodesTotal,
      allCodesSet,
      getAllCodesSet,
      handleBulkMovePlz,
      handleBulkRemovePlz,
      handleExportLayerCSV,
      handleSplitLayer,
      openDiffDialog,
      handleSetLayerGroup,
      existingGroups,
      maxLayerPLZ,
      onHighlightCodes,
    ]
  );

  return (
    <>
      <Collapsible open={ui.layersOpen} onOpenChange={handleSetLayersOpen}>
        <div className="flex items-center gap-0.5">
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 justify-between h-7 px-2 text-xs font-semibold"
              />
            }
          >
            <span>Gebiete ({optimisticLayers.length})</span>
            {ui.layersOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </CollapsibleTrigger>
          {optimisticLayers.length >= 2 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={() =>
                      hasHiddenLayers
                        ? handleShowAllLayers()
                        : handleBulkVisibility(
                            optimisticLayers.map((l) => l.id),
                            false
                          )
                    }
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                  />
                }
              >
                {hasHiddenLayers ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{hasHiddenLayers ? "Alle einblenden" : "Alle ausblenden"}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {optimisticLayers.length >= 2 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={toggleSelectMode}
                    variant="ghost"
                    size="sm"
                    className={`h-7 w-7 p-0 shrink-0 ${selectMode ? "text-primary bg-primary/10" : ""}`}
                  />
                }
              >
                {selectMode ? (
                  <CheckSquare className="h-3 w-3" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>{selectMode ? "Auswahl beenden" : "Mehrfachauswahl"}</p>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  onClick={() => {
                    setShowNewLayerInput((v) => !v);
                    if (!showNewLayerInput) {
                      setTimeout(() => newLayerInputRef.current?.focus(), 50);
                    }
                  }}
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 shrink-0 ${showNewLayerInput ? "text-primary bg-primary/10" : ""}`}
                />
              }
            >
              <IconPlus className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Neues Gebiet erstellen</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0"
                  title="Weitere Aktionen"
                />
              }
            >
              <IconDots className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">
                Weitere Aktionen
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {optimisticLayers.length >= 2 && (
                <>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
                      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">Farbpalette wählen</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52">
                      {COLOR_THEMES.map((theme) => (
                        <DropdownMenuItem
                          key={theme.id}
                          onClick={() => handleReassignColors(theme.id)}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <span className="flex gap-0.5 shrink-0">
                            {theme.sample.slice(0, 5).map((color, i) => (
                              <span
                                key={i}
                                className="inline-block w-3 h-3 rounded-sm"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </span>
                          <span className="text-sm">{theme.label}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleReassignColors()}
                        className="cursor-pointer gap-2"
                      >
                        <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">Optimaler Kontrast</span>
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    onClick={handleSortByCount}
                    className="gap-2 cursor-pointer"
                  >
                    <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">Nach PLZ-Anzahl sortieren</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={handleOpenHistory}
                className="gap-2 cursor-pointer"
              >
                <IconClock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Versionsverlauf</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleOpenVersion}
                className="gap-2 cursor-pointer"
              >
                <IconDeviceFloppy className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Version erstellen</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleOpenMerge}
                className="gap-2 cursor-pointer"
              >
                <IconGitMerge className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Gebiete zusammenführen</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTemplatesDialogOpen(true)}
                className="gap-2 cursor-pointer"
              >
                <IconLayoutColumns className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">Ebenen-Vorlagen</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <CollapsibleContent className="space-y-1 pt-1">
          {/* Bulk action bar */}
          {selectMode && (
            <div className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
              <button
                type="button"
                onClick={
                  selectedIds.size === filteredLayers.length
                    ? clearSelection
                    : selectAll
                }
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {selectedIds.size === filteredLayers.length ? (
                  <CheckSquare className="h-3 w-3 text-primary" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
                <span className="font-medium">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} ausgewählt`
                    : "Alle"}
                </span>
              </button>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-border mx-1">|</span>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={handleBulkShowSelected}
                          className="p-0.5 rounded hover:bg-muted"
                        />
                      }
                    >
                      <Eye className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Einblenden</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={handleBulkHideSelected}
                          className="p-0.5 rounded hover:bg-muted"
                        />
                      }
                    >
                      <EyeOff className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Ausblenden</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={handleBulkDeleteSelected}
                          className="p-0.5 rounded hover:bg-muted text-destructive"
                        />
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{selectedIds.size} Gebiete löschen</p>
                    </TooltipContent>
                  </Tooltip>
                  {selectedIds.size >= 2 && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            onClick={handleOpenMerge}
                            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          />
                        }
                      >
                        <IconGitMerge className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Ausgewählte Gebiete zusammenführen</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <span className="text-border mx-1">|</span>
                  <Popover
                    open={bulkGroupPopoverOpen}
                    onOpenChange={setBulkGroupPopoverOpen}
                  >
                    <Tooltip>
                      <PopoverTrigger
                        render={
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                              />
                            }
                          >
                            <Folder className="h-3 w-3" />
                          </TooltipTrigger>
                        }
                      />
                      <TooltipContent>
                        <p>Gruppe zuweisen</p>
                      </TooltipContent>
                    </Tooltip>
                    <PopoverContent className="w-44 p-1.5" align="start">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1 px-1">
                        Gruppe zuweisen
                      </p>
                      {existingGroups.map((g) => (
                        <button
                          key={g}
                          type="button"
                          className="w-full text-left px-2 py-1 rounded text-xs hover:bg-accent transition-colors flex items-center gap-1.5"
                          onClick={() => {
                            handleBulkAssignGroup(g);
                            setBulkGroupPopoverOpen(false);
                          }}
                        >
                          <Folder className="h-3 w-3 text-muted-foreground shrink-0" />
                          {g}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="w-full text-left px-2 py-1 rounded text-xs text-muted-foreground hover:bg-accent transition-colors mt-0.5 border-t pt-1.5"
                        onClick={() => {
                          handleBulkAssignGroup(null);
                          setBulkGroupPopoverOpen(false);
                        }}
                      >
                        Gruppe entfernen
                      </button>
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>
          )}
          {/* Create new layer — shown when toggled via + in header */}
          {showNewLayerInput && (
            <div className="flex gap-1">
              <Input
                ref={newLayerInputRef}
                value={form.newLayerName}
                onChange={handleNewLayerNameChange}
                maxLength={31}
                placeholder={
                  isViewingVersion
                    ? "Neues Gebiet (neue Version)..."
                    : "Neues Gebiet..."
                }
                className="h-7 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowNewLayerInput(false);
                    return;
                  }
                  handleNewLayerKeyDown(e);
                }}
              />
              <Button
                onClick={async () => {
                  await handleCreateLayer();
                  setShowNewLayerInput(false);
                }}
                disabled={!form.newLayerName.trim() || form.isCreating}
                size="icon"
                className="h-7 w-7"
                title={
                  isViewingVersion
                    ? "Gebiet wird in neuer Version erstellt"
                    : "Gebiet erstellen"
                }
              >
                <IconPlus className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Layer search — shown when there are enough layers to scroll */}
          {optimisticLayers.length >= 5 && (
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                <Input
                  value={layerSearch}
                  onChange={(e) => setLayerSearch(e.target.value)}
                  placeholder="Gebiete filtern…"
                  className="h-7 text-xs pl-7 pr-6"
                />
                {layerSearch && (
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
                    onClick={() => setLayerSearch("")}
                    aria-label="Suche zurücksetzen"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Sortierreihenfolge wechseln"
                      className={`shrink-0 h-7 w-7 flex items-center justify-center rounded border text-muted-foreground transition-colors hover:bg-muted ${layerSortMode !== "default" ? "border-primary/50 bg-primary/5 text-primary" : "border-transparent"}`}
                      onClick={() => {
                        setLayerSortMode((m) =>
                          m === "default"
                            ? "name"
                            : m === "name"
                              ? "count-desc"
                              : m === "count-desc"
                                ? "count-asc"
                                : "default"
                        );
                      }}
                    />
                  }
                >
                  <ArrowDownUp className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {layerSortMode === "default"
                      ? "Sortieren: Standard"
                      : layerSortMode === "name"
                        ? "Sortiert: A–Z"
                        : layerSortMode === "count-desc"
                          ? "Sortiert: PLZ ↓"
                          : "Sortiert: PLZ ↑"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Layer list */}
          <div className="space-y-1 pr-1">
            {plzSearchResults !== null && (
              <div className="mx-1 mb-1 rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                <div className="flex items-center gap-1 mb-1 text-muted-foreground font-medium">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>PLZ {layerSearch.trim()}</span>
                </div>
                {plzSearchResults.length === 0 ? (
                  <p className="text-muted-foreground/70 text-[11px]">
                    Nicht in diesem Gebiet vergeben
                  </p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {plzSearchResults.map((lr) => (
                      <button
                        key={lr.id}
                        type="button"
                        className="flex items-center gap-1.5 text-left hover:bg-muted rounded px-1 py-0.5 transition-colors"
                        onClick={() => {
                          onPreviewPostalCode?.(layerSearch.trim());
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: lr.color }}
                        />
                        <span className="truncate text-foreground">
                          {lr.name}
                        </span>
                        <MapPin className="h-2.5 w-2.5 shrink-0 ml-auto text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {filteredLayers.length === 0 && layerSearch ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                Keine Gebiete gefunden
              </p>
            ) : isDragDisabled ? (
              groupedLayers.flatMap(({ name: gName, layers: gLayers }) => [
                ...(gName !== null ? [renderGroupHeader(gName, gLayers)] : []),
                ...(collapsedGroups.has(gName ?? "") && gName !== null
                  ? []
                  : gLayers.map((layer) => (
                      <LayerListItem
                        key={layer.id}
                        {...getLayerItemProps(layer)}
                      />
                    ))),
              ])
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={DND_MODIFIERS}
              >
                <SortableContext
                  items={layerIds}
                  strategy={verticalListSortingStrategy}
                >
                  {groupedLayers.flatMap(({ name: gName, layers: gLayers }) => [
                    ...(gName !== null
                      ? [renderGroupHeader(gName, gLayers)]
                      : []),
                    ...(collapsedGroups.has(gName ?? "") && gName !== null
                      ? []
                      : gLayers.map((layer) => (
                          <SortableLayerListItem
                            key={layer.id}
                            {...getLayerItemProps(layer)}
                          />
                        ))),
                  ])}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Duplicate PLZ detail panel — only rendered when duplicates are shown */}
          {showDuplicates && duplicateCodeMap.size > 0 && (
            <div className="border-t pt-1.5 mt-0.5 space-y-1.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-amber-500 font-medium uppercase tracking-wide">
                    Doppelte PLZ ({duplicateCodeMap.size})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="text-[9px] text-amber-500 hover:text-amber-600 font-medium hover:underline"
                      title="Alle Duplikate automatisch bereinigen"
                      onClick={async () => {
                        for (const [
                          code,
                          layerIds,
                        ] of duplicateCodeMap.entries()) {
                          await fixDuplicateCodeAction(areaId, code, layerIds);
                        }
                        onLayerUpdate?.();
                        setShowDuplicates(false);
                      }}
                    >
                      Alle fixen
                    </button>
                    <button
                      type="button"
                      className="text-[9px] text-muted-foreground hover:text-foreground"
                      onClick={() => setShowDuplicates(false)}
                      aria-label="Duplikat-Ansicht schließen"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-0.5">
                  {[...duplicateCodeMap.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([code, layerIds]) => (
                      <div
                        key={code}
                        className="flex items-center gap-1 text-[10px]"
                      >
                        <button
                          type="button"
                          className="font-mono font-medium text-amber-500 hover:underline shrink-0"
                          title={`PLZ ${code} auf der Karte anzeigen`}
                          onClick={() => {
                            onPreviewPostalCode?.(code);
                            setTimeout(() => onPreviewPostalCode?.(null), 2000);
                          }}
                        >
                          {code}
                        </button>
                        <span className="text-muted-foreground shrink-0">
                          →
                        </span>
                        <span className="flex gap-0.5 flex-wrap flex-1">
                          {layerIds.map((id: number) => {
                            const l = optimisticLayers.find((x) => x.id === id);
                            return l ? (
                              <Tooltip key={id}>
                                <TooltipTrigger
                                  render={
                                    <button
                                      type="button"
                                      className="px-1 rounded text-[9px] font-medium border border-transparent hover:border-current transition-all hover:scale-105"
                                      style={{
                                        backgroundColor: l.color + "33",
                                        color: l.color,
                                      }}
                                      onClick={async () => {
                                        await fixDuplicateWithLayerAction(
                                          areaId,
                                          code,
                                          id,
                                          layerIds
                                        );
                                        onLayerUpdate?.();
                                      }}
                                    />
                                  }
                                >
                                  {l.name}
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p className="text-[10px]">
                                    Nur in „{l.name}" behalten
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            ) : null;
                          })}
                        </span>
                        <button
                          type="button"
                          className="text-[9px] text-muted-foreground hover:text-amber-500 shrink-0"
                          title="Duplikat bereinigen (behalte Ebene mit den meisten PLZ)"
                          onClick={async () => {
                            await fixDuplicateCodeAction(
                              areaId,
                              code,
                              layerIds
                            );
                            onLayerUpdate?.();
                          }}
                        >
                          Fix
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* CSV Import dialog */}
      <AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PLZ importieren</AlertDialogTitle>
            <AlertDialogDescription>
              Füge PLZ ein oder lade eine Datei hoch — getrennt durch Komma,
              Semikolon, Leerzeichen oder Zeilenumbruch. Auch GeoJSON/CSV mit
              PLZ-Spalte wird unterstützt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"01234, 10115, 20095\noder eine PLZ pro Zeile…"}
              className="w-full min-h-[100px] text-xs rounded border bg-background px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary resize-none font-mono"
              disabled={importPending}
            />
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              <Upload className="h-3 w-3" />
              <span>CSV / TXT / GeoJSON hochladen</span>
              <input
                type="file"
                accept=".csv,.txt,.tsv,.json,.geojson"
                className="sr-only"
                onChange={handleImportFileUpload}
              />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importPending}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleImportCSV();
              }}
              disabled={importPending || !importText.trim()}
            >
              {importPending ? "Importiere…" : "Importieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LayerTemplatesDialog
        open={templatesDialogOpen}
        onOpenChange={setTemplatesDialogOpen}
        areaId={areaId}
        currentLayers={templateCurrentLayers}
        onApplied={handleTemplateApplied}
      />

      {/* Layer Diff Dialog */}
      <Dialog
        open={diffDialog.open}
        onOpenChange={(open) => setDiffDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Layer-Vergleich</DialogTitle>
            <DialogDescription>
              Unterschiede zwischen zwei Ebenen auf einen Blick
            </DialogDescription>
          </DialogHeader>
          {diffDialog.layerAId &&
            diffDialog.layerBId &&
            (() => {
              const layerA = optimisticLayers.find(
                (l) => l.id === diffDialog.layerAId
              );
              const layerB = optimisticLayers.find(
                (l) => l.id === diffDialog.layerBId
              );
              if (!layerA || !layerB) return null;
              const setA = new Set(
                (layerA.postalCodes ?? []).map((p) => p.postalCode)
              );
              const setB = new Set(
                (layerB.postalCodes ?? []).map((p) => p.postalCode)
              );
              const onlyA = [...setA].filter((c) => !setB.has(c)).sort();
              const onlyB = [...setB].filter((c) => !setA.has(c)).sort();
              const both = [...setA].filter((c) => setB.has(c)).sort();
              return (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <select
                      className="flex-1 rounded border bg-background px-2 py-1 text-xs"
                      value={diffDialog.layerAId ?? ""}
                      onChange={(e) =>
                        setDiffDialog((prev) => ({
                          ...prev,
                          layerAId: Number(e.target.value),
                        }))
                      }
                    >
                      {optimisticLayers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({(l.postalCodes ?? []).length})
                        </option>
                      ))}
                    </select>
                    <span className="self-center text-xs text-muted-foreground">
                      vs
                    </span>
                    <select
                      className="flex-1 rounded border bg-background px-2 py-1 text-xs"
                      value={diffDialog.layerBId ?? ""}
                      onChange={(e) =>
                        setDiffDialog((prev) => ({
                          ...prev,
                          layerBId: Number(e.target.value),
                        }))
                      }
                    >
                      {optimisticLayers.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({(l.postalCodes ?? []).length})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded border p-2">
                      <div
                        className="font-semibold mb-1 truncate"
                        style={{ color: layerA.color }}
                      >
                        Nur {layerA.name}
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({onlyA.length})
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {onlyA.map((c) => (
                          <div key={c} className="font-mono">
                            {c}
                          </div>
                        ))}
                        {onlyA.length === 0 && (
                          <div className="text-muted-foreground italic">–</div>
                        )}
                      </div>
                    </div>
                    <div className="rounded border p-2 bg-muted/30">
                      <div className="font-semibold mb-1 text-muted-foreground">
                        Gemeinsam
                        <span className="ml-1 font-normal">
                          ({both.length})
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {both.map((c) => (
                          <div key={c} className="font-mono">
                            {c}
                          </div>
                        ))}
                        {both.length === 0 && (
                          <div className="text-muted-foreground italic">–</div>
                        )}
                      </div>
                    </div>
                    <div className="rounded border p-2">
                      <div
                        className="font-semibold mb-1 truncate"
                        style={{ color: layerB.color }}
                      >
                        Nur {layerB.name}
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({onlyB.length})
                        </span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {onlyB.map((c) => (
                          <div key={c} className="font-mono">
                            {c}
                          </div>
                        ))}
                        {onlyB.length === 0 && (
                          <div className="text-muted-foreground italic">–</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </>
  );
});
