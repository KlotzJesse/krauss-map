"use client";

import {
  IconAlertTriangle,
  IconClock,
  IconDeviceFloppy,
  IconGitMerge,
  IconHistory,
  IconPlus,
} from "@tabler/icons-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import type { InferSelectModel } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { CheckSquare, ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, HelpCircle, Palette, Search, Square, Trash2, Upload, X } from "lucide-react";
import dynamic from "next/dynamic";
import { memo } from "react";
import type { Dispatch, RefObject } from "react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import {
  createLayerAction,
  deleteLayerAction,
  duplicateLayerAction,
  updateLayerAction,
  exportAreaGeoJSONAction,
  exportAreaDataAction,
  importAreaFromDataAction,
} from "@/app/actions/area-actions";
import { batchUpdateVisibilityAction, mergeLayersAction } from "@/app/actions/layer-actions";
import { DrawingActionsSection } from "@/components/shared/drawing-actions-section";
import { GranularitySelector } from "@/components/shared/granularity-selector";
import { LayerListItem } from "@/components/shared/layer-list-item";
import { PendingRegionsSection } from "@/components/shared/pending-regions-section";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLayerFormState } from "@/lib/hooks/use-layer-form-state";
import type { TerraDrawMode } from "@/lib/hooks/use-terradraw";
import type {
  ChangeSummary,
  VersionSummary,
  areaLayers,
} from "@/lib/schema/schema";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";
import { exportLayersPDF, exportLayersXLSX } from "@/lib/utils/export-utils";
import { generateNextColor, reassignAllColors } from "@/lib/utils/layer-colors";

const EMPTY_ARRAY: never[] = [];

// Lazy-load dialog components — only fetched when users open them
const CreateVersionDialog = dynamic(
  () =>
    import("@/components/areas/create-version-dialog").then(
      (m) => m.CreateVersionDialog
    ),
  { ssr: false }
);
const EnhancedVersionHistoryDialog = dynamic(
  () =>
    import("@/components/areas/enhanced-version-history-dialog").then(
      (m) => m.EnhancedVersionHistoryDialog
    ),
  { ssr: false }
);
const LayerMergeDialog = dynamic(
  () =>
    import("@/components/areas/layer-merge-dialog").then(
      (m) => m.LayerMergeDialog
    ),
  { ssr: false }
);

interface StatsSectionProps {
  layers: Layer[];
  postalCodesData?: FeatureCollection<Polygon | MultiPolygon>;
}

function StatsSection({ layers, postalCodesData }: StatsSectionProps) {
  const totalFeatures = postalCodesData?.features.length ?? 0;
  const assignedSet = new Set(
    layers.flatMap((l) => l.postalCodes?.map((pc) => pc.postalCode) ?? [])
  );
  const assignedCount = assignedSet.size;
  const unassignedCount = Math.max(0, totalFeatures - assignedCount);
  const coverage =
    totalFeatures > 0 ? (assignedCount / totalFeatures) * 100 : 0;

  return (
    <>
      <Separator />
      <div className="space-y-2 pb-1">
        <div className="text-xs font-semibold">Statistik</div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-md bg-muted/60 px-2 py-1.5 text-center">
            <div className="text-sm font-bold tabular-nums">
              {assignedCount.toLocaleString("de-DE")}
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              Zugewiesen
            </div>
          </div>
          <div className="rounded-md bg-muted/60 px-2 py-1.5 text-center">
            <div className="text-sm font-bold tabular-nums">
              {unassignedCount.toLocaleString("de-DE")}
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              Ohne Gebiet
            </div>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Abdeckung</span>
            <span className="font-semibold tabular-nums">
              {coverage.toFixed(1)}&thinsp;%
            </span>
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.min(coverage, 100)}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Gesamt PLZ</span>
          <span className="tabular-nums">
            {totalFeatures.toLocaleString("de-DE")}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Gebiete</span>
          <span className="tabular-nums">{layers.length}</span>
        </div>
      </div>
    </>
  );
}

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

export interface DrawingToolsProps {
  currentMode: TerraDrawMode | null;

  onModeChange: (mode: TerraDrawMode | null) => void;

  onClearAll: () => void;

  onToggleVisibility: () => void;

  granularity?: string;

  country?: import("@/lib/config/countries").CountryCode;

  onGranularityChange?: (granularity: string) => void;

  postalCodesData?: FeatureCollection<Polygon | MultiPolygon>;

  pendingPostalCodes?: string[];

  onAddPending?: () => void;

  onRemovePending?: () => void;

  // Layer management props

  areaId?: number;

  areaName?: string; // Optional area/project name for exports

  activeLayerId?: number | null;

  onLayerSelect?: (layerId: number) => void;

  // Layer data and operations passed from server

  layers?: Layer[];

  onLayerUpdate?: () => void; // Callback to refresh layer data

  addPostalCodesToLayer?: (layerId: number, codes: string[]) => Promise<void>;

  removePostalCodesFromLayer?: (
    layerId: number,

    codes: string[]
  ) => Promise<void>;

  // Version viewing props

  isViewingVersion?: boolean;

  versionId?: number | null;

  isLayerSwitchPending?: boolean;

  // Version and change data for dialogs

  versions: VersionSummary[];

  changes: ChangeSummary[];

  /** Callback to open the conflict resolution panel (managed by parent). */
  onOpenConflicts?: () => void;
}

// --- UI state reducer ---

interface DrawingToolsUIState {
  layersOpen: boolean;
  regionsOpen: boolean;
  showVersionHistory: boolean;
  showCreateVersion: boolean;
  showLayerMerge: boolean;
  showKeyboardHelp: boolean;
  isFilling: boolean;
}

type DrawingToolsUIAction =
  | { type: "SET_LAYERS_OPEN"; open: boolean }
  | { type: "SET_REGIONS_OPEN"; open: boolean }
  | { type: "OPEN_HISTORY" }
  | { type: "CLOSE_HISTORY" }
  | { type: "OPEN_VERSION" }
  | { type: "CLOSE_VERSION" }
  | { type: "OPEN_MERGE" }
  | { type: "CLOSE_MERGE" }
  | { type: "OPEN_KEYBOARD_HELP" }
  | { type: "CLOSE_KEYBOARD_HELP" }
  | { type: "SET_FILLING"; value: boolean }
  | { type: "AUTO_OPEN_REGIONS" };

function drawingToolsUIReducer(
  state: DrawingToolsUIState,
  action: DrawingToolsUIAction
): DrawingToolsUIState {
  switch (action.type) {
    case "SET_LAYERS_OPEN": {
      return { ...state, layersOpen: action.open };
    }
    case "SET_REGIONS_OPEN": {
      return { ...state, regionsOpen: action.open };
    }
    case "AUTO_OPEN_REGIONS": {
      return { ...state, regionsOpen: true };
    }
    case "OPEN_HISTORY": {
      return { ...state, showVersionHistory: true };
    }
    case "CLOSE_HISTORY": {
      return { ...state, showVersionHistory: false };
    }
    case "OPEN_VERSION": {
      return { ...state, showCreateVersion: true };
    }
    case "CLOSE_VERSION": {
      return { ...state, showCreateVersion: false };
    }
    case "OPEN_MERGE": {
      return { ...state, showLayerMerge: true };
    }
    case "CLOSE_MERGE": {
      return { ...state, showLayerMerge: false };
    }
    case "OPEN_KEYBOARD_HELP": {
      return { ...state, showKeyboardHelp: true };
    }
    case "CLOSE_KEYBOARD_HELP": {
      return { ...state, showKeyboardHelp: false };
    }
    case "SET_FILLING": {
      return { ...state, isFilling: action.value };
    }
    default: {
      return state;
    }
  }
}

// Fill logic using server-side geoprocessing API

async function fillRegions(
  mode: "all" | "holes" | "expand",

  activeLayer: Layer,

  addPostalCodesToLayer: (layerId: number, codes: string[]) => Promise<void>,

  setIsFilling: (b: boolean) => void,

  granularity?: string,

  country?: string
) {
  if (!granularity) {
    toast.error("Granularität ist erforderlich für die Geoverarbeitung");

    return;
  }

  if (!activeLayer) {
    toast.error("Bitte wählen Sie ein aktives Gebiet aus");

    return;
  }

  const fillPromise = async () => {
    setIsFilling(true);

    try {
      const layerCodes =
        activeLayer.postalCodes?.map((pc) => pc.postalCode) || [];

      // Use server action instead of client-side fetch

      const { geoprocessAction } = await import("@/app/actions/area-actions");

      const result = await geoprocessAction({
        mode,

        granularity,

        selectedCodes: layerCodes,

        country,
      });

      if (!result.success) {
        throw new Error(
          result.error || "Server-Geoverarbeitung fehlgeschlagen"
        );
      }

      const resultCodes = result.data?.resultCodes || [];

      if (resultCodes && resultCodes.length > 0) {
        await addPostalCodesToLayer(activeLayer.id, resultCodes);
      }

      const count = (resultCodes || []).length;

      const modeText =
        mode === "all"
          ? "alle Lücken"
          : mode === "holes"
            ? "Lücken"
            : "eine Ebene";

      return `${count} Region${count === 1 ? "" : "en"} gefüllt (${modeText})`;
    } catch {}
    setIsFilling(false);
  };

  executeAction(fillPromise(), {
    loading: "Geoverarbeitung läuft...",

    success: (message) => message!,

    error: "Fehler bei der Geoverarbeitung",
  });
}

interface UseDrawingToolsActionsProps {
  areaId: DrawingToolsProps["areaId"];
  areaName: DrawingToolsProps["areaName"];
  activeLayerId: DrawingToolsProps["activeLayerId"];
  onLayerSelect: DrawingToolsProps["onLayerSelect"];
  layers: Layer[];
  onLayerUpdate: DrawingToolsProps["onLayerUpdate"];
  addPostalCodesToLayer: DrawingToolsProps["addPostalCodesToLayer"];
  removePostalCodesFromLayer: DrawingToolsProps["removePostalCodesFromLayer"];
  pendingPostalCodes: string[];
  onAddPending: DrawingToolsProps["onAddPending"];
  onRemovePending: DrawingToolsProps["onRemovePending"];
  granularity: DrawingToolsProps["granularity"];
  country: DrawingToolsProps["country"];
  postalCodesData: DrawingToolsProps["postalCodesData"];
}

function useDrawingToolsActions({
  areaId,
  areaName,
  activeLayerId,
  onLayerSelect,
  layers,
  onLayerUpdate,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
  pendingPostalCodes,
  onAddPending,
  onRemovePending,
  granularity,
  country,
  postalCodesData,
}: UseDrawingToolsActionsProps) {
  const [optimisticLayers, updateOptimisticLayers] = useOptimistic(
    layers,
    (
      currentLayers: Layer[],
      update: {
        type: "create" | "update" | "delete" | "reorder";
        layer?: Partial<Layer>;
        id?: number;
        layers?: Layer[];
      }
    ) => {
      if (update.type === "create" && update.layer) {
        return [...currentLayers, { ...update.layer, id: Date.now() } as Layer];
      }
      if (update.type === "update" && update.id && update.layer) {
        return currentLayers.map((l) =>
          l.id === update.id ? { ...l, ...update.layer } : l
        );
      }
      if (update.type === "delete" && update.id) {
        return currentLayers.filter((l) => l.id !== update.id);
      }
      if (update.type === "reorder" && update.layers) {
        return update.layers;
      }
      return currentLayers;
    }
  );

  const [_isPending, startTransition] = useTransition();

  const [ui, dispatchUI] = useReducer(drawingToolsUIReducer, {
    layersOpen: !!areaId,
    regionsOpen: false,
    showVersionHistory: false,
    showCreateVersion: false,
    showLayerMerge: false,
    showKeyboardHelp: false,
    isFilling: false,
  });

  const {
    state: form,
    dispatch: dispatchForm,
    editLayerInputRef,
  } = useLayerFormState();

  // Derived-state pattern: auto-open regions when new pending codes arrive
  const [prevPendingLength, setPrevPendingLength] = useState(
    pendingPostalCodes.length
  );
  if (
    pendingPostalCodes.length > 0 &&
    pendingPostalCodes.length !== prevPendingLength
  ) {
    setPrevPendingLength(pendingPostalCodes.length);
    dispatchUI({ type: "AUTO_OPEN_REGIONS" });
  }

  const createLayer = async (data: {
    name: string;
    color: string;
    orderIndex: number;
  }) => {
    if (!areaId) {
      return;
    }
    const result = await createLayerAction(areaId, {
      name: data.name,
      color: data.color,
      opacity: 70,
      isVisible: true,
      orderIndex: data.orderIndex,
    });
    if (result.success) {
      onLayerUpdate?.();
      return result.data;
    }
    throw new Error(result.error);
  };

  const updateLayer = async (
    layerId: number,
    data: Record<string, unknown>
  ) => {
    if (!areaId) {
      return;
    }
    const result = await updateLayerAction(areaId, layerId, data);
    if (result.success) {
      onLayerUpdate?.();
    } else {
      throw new Error(result.error);
    }
  };

  const deleteLayer = async (layerId: number) => {
    if (!areaId) {
      return;
    }
    const result = await deleteLayerAction(areaId, layerId);
    if (result.success) {
      onLayerUpdate?.();
    } else {
      throw new Error(result.error);
    }
  };

  const handleAddPendingToLayer = async () => {
    if (
      !areaId ||
      !activeLayerId ||
      !addPostalCodesToLayer ||
      pendingPostalCodes.length === 0
    ) {
      if (!areaId || !activeLayerId) {
        toast.warning("Bitte wählen Sie ein aktives Gebiet aus", {
          duration: 3000,
        });
      } else if (pendingPostalCodes.length === 0) {
        toast.info("Keine Regionen zum Hinzufügen gefunden", {
          duration: 2000,
        });
      } else if (!addPostalCodesToLayer) {
        toast.error("Gebiets-Funktion nicht verfügbar", { duration: 2000 });
      }
      return;
    }
    const suffix = pendingPostalCodes.length === 1 ? "" : "en";
    try {
      await addPostalCodesToLayer(activeLayerId, pendingPostalCodes);
      toast.success(
        `${pendingPostalCodes.length} Region${suffix} zu Gebiet hinzugefügt`,
        { duration: 2000 }
      );
    } catch {
      toast.error("Fehler beim Hinzufügen der Regionen", { duration: 2000 });
    }
    onAddPending?.();
  };

  const handleRemovePendingFromLayer = async () => {
    if (
      !areaId ||
      !activeLayerId ||
      !removePostalCodesFromLayer ||
      pendingPostalCodes.length === 0
    ) {
      if (!areaId || !activeLayerId) {
        toast.warning("Bitte wählen Sie ein aktives Gebiet aus", {
          duration: 3000,
        });
      } else if (pendingPostalCodes.length === 0) {
        toast.info("Keine Regionen zum Entfernen gefunden", { duration: 2000 });
      } else if (!removePostalCodesFromLayer) {
        toast.error("Gebiets-Funktion nicht verfügbar", { duration: 2000 });
      }
      return;
    }
    const removeSuffix = pendingPostalCodes.length === 1 ? "" : "en";
    try {
      await removePostalCodesFromLayer(activeLayerId, pendingPostalCodes);
      toast.success(
        `${pendingPostalCodes.length} Region${removeSuffix} aus Gebiet entfernt`,
        { duration: 2000 }
      );
    } catch {
      toast.error("Fehler beim Entfernen der Regionen", { duration: 2000 });
    }
    onRemovePending?.();
  };

  const handleExportExcel = async () => {
    if (!optimisticLayers.length) {
      toast.warning("Keine Ebenen zum Exportieren vorhanden");
      return;
    }
    const layersWithCodes = optimisticLayers
      .filter((layer) => layer.postalCodes && layer.postalCodes.length > 0)
      .map((layer) => ({
        layerName: layer.name,
        postalCodes: layer.postalCodes!.map((pc) => pc.postalCode),
      }));
    if (!layersWithCodes.length) {
      toast.warning("Keine Ebenen mit Postleitzahlen zum Exportieren");
      return;
    }
    await exportLayersXLSX(layersWithCodes, areaName);
  };

  const handleExportPDF = async () => {
    if (!layers.length) {
      toast.warning("Keine Ebenen zum Exportieren vorhanden");
      return;
    }
    const layersWithCodes = layers
      .filter((layer) => layer.postalCodes && layer.postalCodes.length > 0)
      .map((layer) => ({
        layerName: layer.name,
        postalCodes: layer.postalCodes!.map((pc) => pc.postalCode),
      }));
    if (!layersWithCodes.length) {
      toast.warning("Keine Ebenen mit Postleitzahlen zum Exportieren");
      return;
    }
    await exportLayersPDF(layersWithCodes, areaName);
  };

  const handleExportGeoJSON = async () => {
    if (!areaId) {
      toast.warning("Kein Gebiet ausgewählt");
      return;
    }
    if (!optimisticLayers.length) {
      toast.warning("Keine Ebenen zum Exportieren vorhanden");
      return;
    }
    const result = await exportAreaGeoJSONAction(areaId);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "GeoJSON Export fehlgeschlagen");
      return;
    }
    const blob = new Blob([result.data], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${areaName ?? `gebiet-${areaId}`}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("GeoJSON exportiert");
  };

  const handleExportData = async () => {
    if (!areaId) {
      toast.warning("Kein Gebiet ausgewählt");
      return;
    }
    const result = await exportAreaDataAction(areaId);
    if (!result.success || !result.data) {
      toast.error(result.error ?? "JSON Export fehlgeschlagen");
      return;
    }
    const blob = new Blob([result.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${areaName ?? `gebiet-${areaId}`}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("JSON exportiert");
  };

  const handleCreateLayer = async () => {
    if (!form.newLayerName.trim()) {
      return;
    }
    dispatchForm({ type: "START_CREATING" });
    startTransition(async () => {
      const existingColors = optimisticLayers.map((l) => l.color);
      const nextColor = generateNextColor(existingColors);
      const createdLayerName = form.newLayerName;
      updateOptimisticLayers({
        type: "create",
        layer: {
          name: createdLayerName,
          color: nextColor,
          opacity: 70,
          isVisible: "true",
          orderIndex: optimisticLayers.length,
          areaId: areaId!,
          postalCodes: [],
        },
      });
      dispatchForm({ type: "FINISH_CREATING" });
      await executeAction(
        createLayer({
          name: createdLayerName,
          color: nextColor,
          orderIndex: optimisticLayers.length,
        }),
        {
          loading: `Erstelle Gebiet "${createdLayerName}"...`,
          success: (result) => {
            if (result?.id && onLayerSelect) {
              onLayerSelect(result.id);
            }
            return `Gebiet "${createdLayerName}" erstellt`;
          },
          error: "Fehler beim Erstellen - Bitte erneut versuchen",
        }
      );
    });
  };

  const handleColorChange = async (layerId: number, color: string) => {
    startTransition(async () => {
      updateOptimisticLayers({ type: "update", id: layerId, layer: { color } });
      try {
        await updateLayer(layerId, { color });
      } catch {
        toast.error("Fehler beim Ändern der Farbe - Bitte erneut versuchen");
      }
    });
  };

  const handleOpacityChange = (layerId: number, opacity: number) => {
    startTransition(async () => {
      updateOptimisticLayers({
        type: "update",
        id: layerId,
        layer: { opacity },
      });
      try {
        await updateLayer(layerId, { opacity });
      } catch {
        toast.error(
          "Fehler beim Ändern der Transparenz - Bitte erneut versuchen"
        );
      }
    });
  };

  const handleToggleVisibility = (layerId: number, visible: boolean) => {
    startTransition(async () => {
      updateOptimisticLayers({
        type: "update",
        id: layerId,
        layer: { isVisible: visible ? "true" : "false" },
      });
      if (areaId) {
        const result = await batchUpdateVisibilityAction(areaId, [
          { layerId, isVisible: visible },
        ]);
        if (result.success) onLayerUpdate?.();
      }
    });
  };

  const handleSoloLayer = (soloId: number) => {
    startTransition(async () => {
      const updates: { layerId: number; isVisible: boolean }[] = [];
      for (const layer of optimisticLayers) {
        const shouldBeVisible = layer.id === soloId;
        const currentlyVisible = layer.isVisible !== "false";
        if (currentlyVisible !== shouldBeVisible) {
          updates.push({ layerId: layer.id, isVisible: shouldBeVisible });
          updateOptimisticLayers({
            type: "update",
            id: layer.id,
            layer: { isVisible: shouldBeVisible ? "true" : "false" },
          });
        }
      }
      if (areaId && updates.length > 0) {
        const result = await batchUpdateVisibilityAction(areaId, updates);
        if (result.success) onLayerUpdate?.();
      }
    });
  };

  const handleShowAllLayers = () => {
    startTransition(async () => {
      const updates: { layerId: number; isVisible: boolean }[] = [];
      for (const layer of optimisticLayers) {
        if (layer.isVisible === "false") {
          updates.push({ layerId: layer.id, isVisible: true });
          updateOptimisticLayers({
            type: "update",
            id: layer.id,
            layer: { isVisible: "true" },
          });
        }
      }
      if (areaId && updates.length > 0) {
        const result = await batchUpdateVisibilityAction(areaId, updates);
        if (result.success) onLayerUpdate?.();
      }
    });
  };

  const handleDeleteLayer = (layerId: number) => {
    dispatchForm({ type: "OPEN_DELETE", layerId });
  };

  const confirmDeleteLayer = async () => {
    if (!form.layerToDelete) {
      return;
    }
    startTransition(async () => {
      updateOptimisticLayers({ type: "delete", id: form.layerToDelete! });
      dispatchForm({ type: "CLOSE_DELETE" });
      const deletedLayerId = form.layerToDelete!;
      try {
        await executeAction(deleteLayer(deletedLayerId), {
          loading: "Lösche Gebiet...",
          success: "Gebiet gelöscht",
          error: "Fehler beim Löschen - Änderung wird rückgängig gemacht",
        });
      } catch {
        // error handled by executeAction
      }
    });
  };

  const handleRenameLayer = async (layerId: number, newName: string) => {
    const trimmed = newName.trim().slice(0, 31);
    if (!trimmed) {
      toast.error("Gebiets-Name darf nicht leer sein");
      return;
    }
    startTransition(async () => {
      updateOptimisticLayers({
        type: "update",
        id: layerId,
        layer: { name: trimmed },
      });
      dispatchForm({ type: "CANCEL_EDIT" });
      try {
        await executeAction(updateLayer(layerId, { name: trimmed }), {
          loading: "Benenne Gebiet um...",
          success: "Gebiet umbenannt",
          error: "Fehler beim Umbenennen - Bitte erneut versuchen",
        });
      } catch {
        // error handled by executeAction
      }
    });
  };

  const handleFillHoles = () => {
    const activeLayer = optimisticLayers.find((l) => l.id === activeLayerId);
    if (postalCodesData && activeLayer) {
      fillRegions(
        "holes",
        activeLayer,
        addPostalCodesToLayer ?? (async () => {}),
        (v) => dispatchUI({ type: "SET_FILLING", value: v }),
        granularity,
        country
      );
    }
  };

  const handleReassignColors = () => {
    startTransition(async () => {
      const colorMap = reassignAllColors(optimisticLayers);
      for (const [id, color] of colorMap) {
        updateOptimisticLayers({ type: "update", id, layer: { color } });
      }
      try {
        await Promise.all(
          [...colorMap].map(([id, color]) => updateLayer(id, { color }))
        );
        toast.success("Farben optimiert");
        onLayerUpdate?.();
      } catch {
        toast.error("Fehler beim Zuweisen der Farben");
      }
    });
  };

  const handleReorderLayers = (oldIndex: number, newIndex: number) => {
    startTransition(async () => {
      const reordered = arrayMove(optimisticLayers, oldIndex, newIndex);
      const withNewIndices = reordered.map((l, i) => ({
        ...l,
        orderIndex: i,
      }));
      updateOptimisticLayers({ type: "reorder", layers: withNewIndices });
      const changedLayers = withNewIndices.filter(
        (l, i) => optimisticLayers[i]?.id !== l.id
      );
      try {
        await Promise.all(
          changedLayers.map((l) =>
            updateLayer(l.id, { orderIndex: l.orderIndex })
          )
        );
        onLayerUpdate?.();
      } catch {
        toast.error("Fehler beim Speichern der Reihenfolge");
      }
    });
  };

  const handleRemovePostalCodeFromLayer = (layerId: number, postalCode: string) => {
    if (!removePostalCodesFromLayer) return;
    startTransition(async () => {
      const layer = optimisticLayers.find((l) => l.id === layerId);
      const updated = layer?.postalCodes?.filter(
        (pc) => pc.postalCode !== postalCode
      ) ?? [];
      updateOptimisticLayers({
        type: "update",
        id: layerId,
        layer: { postalCodes: updated },
      });
      try {
        await removePostalCodesFromLayer(layerId, [postalCode]);
        onLayerUpdate?.();
      } catch {
        toast.error("Fehler beim Entfernen der PLZ");
      }
    });
  };

  const handleNotesChange = (layerId: number, notes: string) => {
    startTransition(async () => {
      updateOptimisticLayers({ type: "update", id: layerId, layer: { notes } });
      try {
        await updateLayer(layerId, { notes: notes || null });
      } catch {
        toast.error("Fehler beim Speichern der Notiz");
      }
    });
  };

  const handleBulkDelete = (layerIds: number[]) => {
    if (!layerIds.length) return;
    startTransition(async () => {
      for (const id of layerIds) {
        updateOptimisticLayers({ type: "delete", id });
      }
      try {
        await Promise.all(layerIds.map((id) => deleteLayer(id)));
        toast.success(`${layerIds.length} Gebiete gelöscht`);
      } catch {
        toast.error("Fehler beim Löschen");
      }
    });
  };

  const handleBulkVisibility = (layerIds: number[], visible: boolean) => {
    if (!layerIds.length || !areaId) return;
    startTransition(async () => {
      for (const id of layerIds) {
        updateOptimisticLayers({
          type: "update",
          id,
          layer: { isVisible: visible ? "true" : "false" },
        });
      }
      try {
        await batchUpdateVisibilityAction(
          areaId,
          layerIds.map((id) => ({ layerId: id, isVisible: visible }))
        );
      } catch {
        toast.error("Fehler beim Ändern der Sichtbarkeit");
      }
    });
  };

  return {
    optimisticLayers,
    ui,
    dispatchUI,
    form,
    dispatchForm,
    editLayerInputRef,
    handleAddPendingToLayer,
    handleRemovePendingFromLayer,
    handleExportExcel,
    handleExportPDF,
    handleCreateLayer,
    handleColorChange,
    handleDeleteLayer,
    confirmDeleteLayer,
    handleRenameLayer,
    handleFillHoles,
    handleToggleVisibility,
    handleSoloLayer,
    handleShowAllLayers,
    handleReassignColors,
    handleOpacityChange,
    handleReorderLayers,
    handleRemovePostalCodeFromLayer,
    handleNotesChange,
    handleExportGeoJSON,
    handleExportData,
    handleBulkDelete,
    handleBulkVisibility,
  };
}

type SortableLayerListItemProps = React.ComponentProps<typeof LayerListItem>;

function SortableLayerListItem({ layer, ...props }: SortableLayerListItemProps) {
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
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
        {...props}
      />
    </div>
  );
}

interface LayerManagementSectionProps {
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
  handleToggleVisibility: (layerId: number, visible: boolean) => void;
  handleSoloLayer: (layerId: number) => void;
  handleShowAllLayers: () => void;
  handleReassignColors: () => void;
  handleReorderLayers: (oldIndex: number, newIndex: number) => void;
  handleRemovePostalCodeFromLayer?: (layerId: number, postalCode: string) => void;
  handleNotesChange?: (layerId: number, notes: string) => void;
  handleBulkDelete: (layerIds: number[]) => void;
  handleBulkVisibility: (layerIds: number[], visible: boolean) => void;
  addPostalCodesToLayer?: (layerId: number, codes: string[]) => Promise<void>;
  onOpenConflicts?: () => void;
}

function LayerManagementSection({
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
  handleToggleVisibility,
  handleSoloLayer,
  handleShowAllLayers,
  handleReassignColors,
  handleReorderLayers,
  handleRemovePostalCodeFromLayer,
  handleNotesChange,
  handleBulkDelete,
  handleBulkVisibility,
  addPostalCodesToLayer,
  onOpenConflicts,
}: LayerManagementSectionProps) {
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
    (open: boolean) => dispatchUI({ type: "SET_LAYERS_OPEN", open }),
    [dispatchUI]
  );
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
  const filteredLayers = useMemo(() => {
    const q = layerSearch.trim().toLowerCase();
    if (!q) return optimisticLayers;
    return optimisticLayers.filter((l) => l.name.toLowerCase().includes(q));
  }, [optimisticLayers, layerSearch]);

  const isDragDisabled = !!layerSearch.trim();

  // PLZ quick-find: search which layer(s) contain a given code
  const [plzFindQuery, setPlzFindQuery] = useState("");
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

  // CSV import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importTargetLayerId, setImportTargetLayerId] = useState<number | null>(null);
  const [importText, setImportText] = useState("");
  const [importPending, setImportPending] = useState(false);

  const openImportDialog = useCallback((layerId: number) => {
    setImportTargetLayerId(layerId);
    setImportText("");
    setImportDialogOpen(true);
  }, []);

  const handleImportCSV = useCallback(async () => {
    if (!addPostalCodesToLayer || !importTargetLayerId) return;
    const codes = importText
      .split(/[\s,;|\n\r]+/)
      .map((s) => s.replace(/\D/g, "").trim())
      .filter((s) => s.length >= 2 && s.length <= 5);
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
        setImportText((prev) =>
          prev ? `${prev}\n${ev.target?.result}` : String(ev.target?.result ?? "")
        );
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = optimisticLayers.findIndex((l) => l.id === active.id);
      const newIndex = optimisticLayers.findIndex((l) => l.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        handleReorderLayers(oldIndex, newIndex);
      }
    },
    [optimisticLayers, handleReorderLayers]
  );

  // Per-layer duplicate postal code counts + overall stats
  const { duplicateCountByLayer, layerStats } = useMemo(() => {
    const counts = new Map<number, number>();
    const codeToLayers = new Map<string, number[]>();
    let totalCodes = 0;
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
    return {
      duplicateCountByLayer: counts,
      layerStats: {
        uniqueCodes: codeToLayers.size,
        totalCodes,
        duplicateCodes: duplicateCodeCount,
      },
    };
  }, [optimisticLayers]);

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
          {hasHiddenLayers && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleShowAllLayers}
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                  />
                }
              >
                <Eye className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Alle Gebiete einblenden</p>
              </TooltipContent>
            </Tooltip>
          )}
          {optimisticLayers.length >= 2 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleReassignColors}
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                  />
                }
              >
                <Palette className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Farben für maximalen Kontrast optimieren</p>
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
        </div>
        <CollapsibleContent className="space-y-2 pt-2">
          {/* Bulk action bar */}
          {selectMode && (
            <div className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
              <button
                type="button"
                onClick={selectedIds.size === filteredLayers.length ? clearSelection : selectAll}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                {selectedIds.size === filteredLayers.length ? (
                  <CheckSquare className="h-3 w-3 text-primary" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
                <span className="font-medium">{selectedIds.size > 0 ? `${selectedIds.size} ausgewählt` : "Alle"}</span>
              </button>
              {selectedIds.size > 0 && (
                <>
                  <span className="text-border mx-1">|</span>
                  <Tooltip>
                    <TooltipTrigger render={<button type="button" onClick={handleBulkShowSelected} className="p-0.5 rounded hover:bg-muted" />}>
                      <Eye className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent><p>Einblenden</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<button type="button" onClick={handleBulkHideSelected} className="p-0.5 rounded hover:bg-muted" />}>
                      <EyeOff className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent><p>Ausblenden</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger render={<button type="button" onClick={handleBulkDeleteSelected} className="p-0.5 rounded hover:bg-muted text-destructive" />}>
                      <Trash2 className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent><p>{selectedIds.size} Gebiete löschen</p></TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          )}
          {/* Layer action buttons */}
          <div className="grid grid-cols-4 gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleOpenConflicts}
                    variant="outline"
                    size="sm"
                    className="h-7 px-1.5"
                  />
                }
              >
                <IconAlertTriangle className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Konflikte anzeigen und lösen</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleOpenHistory}
                    variant="outline"
                    size="sm"
                    className="h-7 px-1.5"
                  />
                }
              >
                <IconClock className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Versionsverlauf anzeigen</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleOpenVersion}
                    variant="outline"
                    size="sm"
                    className="h-7 px-1.5"
                  />
                }
              >
                <IconDeviceFloppy className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Neue Version erstellen</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleOpenMerge}
                    variant="outline"
                    size="sm"
                    className="h-7 px-1.5"
                  />
                }
              >
                <IconGitMerge className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Gebiete zusammenführen</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Create new layer */}
          <div className="flex gap-1">
            <Input
              value={form.newLayerName}
              onChange={handleNewLayerNameChange}
              maxLength={31}
              placeholder={
                isViewingVersion
                  ? "Neues Gebiet (neue Version)..."
                  : "Neues Gebiet..."
              }
              className="h-7 text-xs"
              onKeyDown={handleNewLayerKeyDown}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleCreateLayer}
                    disabled={!form.newLayerName.trim() || form.isCreating}
                    size="icon"
                    className="h-7 w-7"
                    title={
                      isViewingVersion
                        ? "Gebiet wird in neuer Version erstellt"
                        : "Gebiet erstellen"
                    }
                  />
                }
              >
                <IconPlus className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Neues Gebiet erstellen</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Layer search — shown when there are enough layers to scroll */}
          {optimisticLayers.length >= 5 && (
            <div className="relative">
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
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {/* Layer list */}
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {filteredLayers.length === 0 && layerSearch ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                Keine Gebiete gefunden
              </p>
            ) : isDragDisabled ? (
              filteredLayers.map((layer) => (
                <LayerListItem
                  key={layer.id}
                  layer={layer}
                  activeLayerId={activeLayerId}
                  isLayerSwitchPending={isLayerSwitchPending}
                  duplicateCount={duplicateCountByLayer.get(layer.id) ?? 0}
                  editingLayerId={form.editingLayerId}
                  editingLayerName={form.editingLayerName}
                  editLayerInputRef={editLayerInputRef}
                  onSelect={(id) => { if (!selectMode) onLayerSelect?.(id); }}
                  onStartEdit={(id, name) =>
                    dispatchForm({ type: "START_EDIT", layerId: id, name })
                  }
                  onConfirmEdit={handleRenameLayer}
                  onCancelEdit={() => dispatchForm({ type: "CANCEL_EDIT" })}
                  onEditNameChange={(name) =>
                    dispatchForm({ type: "SET_EDIT_NAME", name })
                  }
                  onColorChange={handleColorChange}
                  onOpacityChange={handleOpacityChange}
                  onDelete={handleDeleteLayer}
                  onDuplicateLayer={handleDuplicateLayer}
                  onToggleVisibility={handleToggleVisibility}
                   onSoloLayer={handleSoloLayer}
                   onRemovePostalCode={handleRemovePostalCodeFromLayer}
                   onImportCSV={addPostalCodesToLayer ? openImportDialog : undefined}
                   onNotesChange={handleNotesChange}
                   isSelected={selectMode ? selectedIds.has(layer.id) : undefined}
                   onToggleSelect={selectMode ? toggleSelect : undefined}
                 />
               ))
             ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              >
                <SortableContext
                  items={optimisticLayers.map((l) => l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {optimisticLayers.map((layer) => (
                    <SortableLayerListItem
                      key={layer.id}
                      layer={layer}
                      activeLayerId={activeLayerId}
                      isLayerSwitchPending={isLayerSwitchPending}
                      duplicateCount={duplicateCountByLayer.get(layer.id) ?? 0}
                      editingLayerId={form.editingLayerId}
                      editingLayerName={form.editingLayerName}
                      editLayerInputRef={editLayerInputRef}
                      onSelect={(id) => { if (!selectMode) onLayerSelect?.(id); }}
                      onStartEdit={(id, name) =>
                        dispatchForm({ type: "START_EDIT", layerId: id, name })
                      }
                      onConfirmEdit={handleRenameLayer}
                      onCancelEdit={() => dispatchForm({ type: "CANCEL_EDIT" })}
                      onEditNameChange={(name) =>
                        dispatchForm({ type: "SET_EDIT_NAME", name })
                      }
                      onColorChange={handleColorChange}
                      onOpacityChange={handleOpacityChange}
                      onDelete={handleDeleteLayer}
                      onDuplicateLayer={handleDuplicateLayer}
                      onToggleVisibility={handleToggleVisibility}
                      onSoloLayer={handleSoloLayer}
                      onRemovePostalCode={handleRemovePostalCodeFromLayer}
                      onImportCSV={addPostalCodesToLayer ? openImportDialog : undefined}
                      onNotesChange={handleNotesChange}
                      isSelected={selectMode ? selectedIds.has(layer.id) : undefined}
                      onToggleSelect={selectMode ? toggleSelect : undefined}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Layer stats summary — shown when there are layers with codes */}
          {layerStats.totalCodes > 0 && (
            <div className="border-t pt-1.5 mt-0.5 space-y-1.5">
              {/* Summary row */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{layerStats.uniqueCodes}</span> eindeutige PLZ
                </span>
                {layerStats.duplicateCodes > 0 && (
                  <span className="text-amber-500 font-medium">
                    {layerStats.duplicateCodes}✕ doppelt
                  </span>
                )}
                <span>
                  <span className="font-medium text-foreground">{layerStats.totalCodes}</span> gesamt
                </span>
              </div>
              {/* Per-layer mini bar chart */}
              {optimisticLayers.length > 1 && (
                <div className="space-y-0.5">
                  {optimisticLayers
                    .filter((l) => (l.postalCodes?.length ?? 0) > 0)
                    .sort((a, b) => (b.postalCodes?.length ?? 0) - (a.postalCodes?.length ?? 0))
                    .map((layer) => {
                      const count = layer.postalCodes?.length ?? 0;
                      const pct = layerStats.totalCodes > 0 ? (count / layerStats.totalCodes) * 100 : 0;
                      return (
                        <div key={layer.id} className="flex items-center gap-1.5 text-[10px]">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: layer.color }}
                          />
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: layer.color }}
                            />
                          </div>
                          <span className="text-muted-foreground w-6 text-right">{count}</span>
                        </div>
                      );
                    })}
                </div>
              )}
              {/* Keyboard hint */}
              <div className="text-[9px] text-muted-foreground/60 text-right">
                Alt+↑↓ Gebiet wechseln
              </div>
            </div>
          )}

          {/* PLZ quick-find */}
          <div className="border-t pt-1.5 mt-0.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                value={plzFindQuery}
                onChange={(e) => setPlzFindQuery(e.target.value)}
                placeholder="PLZ suchen…"
                className="h-6 text-[10px] pl-6 pr-2"
                maxLength={5}
              />
            </div>
            {plzFindResults !== null && (
              <div className="mt-1 space-y-0.5">
                {plzFindResults.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-0.5">Keine Treffer</p>
                ) : (
                  plzFindResults.map((r) => (
                    <div key={r.id} className="flex items-start gap-1.5 text-[10px]">
                      <span
                        className="w-2 h-2 rounded-full shrink-0 mt-0.5"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="font-medium truncate max-w-[80px]">{r.name}</span>
                      <span className="text-muted-foreground ml-auto font-mono">
                        {r.matchingCodes.join(", ")}
                        {r.matchingCodes.length === 5 ? "…" : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* CSV Import dialog */}
      <AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PLZ importieren</AlertDialogTitle>
            <AlertDialogDescription>
              Füge PLZ ein oder lade eine Datei hoch — getrennt durch Komma, Semikolon, Leerzeichen oder Zeilenumbruch.
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
              <span>CSV / TXT hochladen</span>
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                className="sr-only"
                onChange={handleImportFileUpload}
              />
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importPending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleImportCSV(); }}
              disabled={importPending || !importText.trim()}
            >
              {importPending ? "Importiere…" : "Importieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Separator />
    </>
  );
}

interface LayerDialogsProps {
  areaId: number;
  ui: DrawingToolsUIState;
  dispatchUI: Dispatch<DrawingToolsUIAction>;
  form: ReturnType<typeof useLayerFormState>["state"];
  dispatchForm: ReturnType<typeof useLayerFormState>["dispatch"];
  layers: Layer[];
  versions: DrawingToolsProps["versions"];
  changes: DrawingToolsProps["changes"];
  onLayerUpdate: DrawingToolsProps["onLayerUpdate"];
  confirmDeleteLayer: () => void;
}

const LayerDialogs = memo(function LayerDialogs({
  areaId,
  ui,
  dispatchUI,
  form,
  dispatchForm,
  layers,
  versions,
  changes,
  onLayerUpdate,
  confirmDeleteLayer,
}: LayerDialogsProps) {
  const handleHistoryOpenChange = useCallback(
    (open: boolean) =>
      dispatchUI(open ? { type: "OPEN_HISTORY" } : { type: "CLOSE_HISTORY" }),
    [dispatchUI]
  );
  const handleVersionOpenChange = useCallback(
    (open: boolean) =>
      dispatchUI(open ? { type: "OPEN_VERSION" } : { type: "CLOSE_VERSION" }),
    [dispatchUI]
  );
  const handleMergeOpenChange = useCallback(
    (open: boolean) =>
      dispatchUI(open ? { type: "OPEN_MERGE" } : { type: "CLOSE_MERGE" }),
    [dispatchUI]
  );
  const handleKeyboardHelpOpenChange = useCallback(
    (open: boolean) =>
      dispatchUI(open ? { type: "OPEN_KEYBOARD_HELP" } : { type: "CLOSE_KEYBOARD_HELP" }),
    [dispatchUI]
  );
  const handleDeleteOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        dispatchForm({ type: "CLOSE_DELETE" });
      }
    },
    [dispatchForm]
  );
  const handleVersionCreated = useCallback(
    () => onLayerUpdate?.(),
    [onLayerUpdate]
  );
  const handleMergeComplete = useCallback(
    () => onLayerUpdate?.(),
    [onLayerUpdate]
  );
  const handleCloseDelete = useCallback(
    () => dispatchForm({ type: "CLOSE_DELETE" }),
    [dispatchForm]
  );

  return (
    <>
      <EnhancedVersionHistoryDialog
        open={ui.showVersionHistory}
        onOpenChange={handleHistoryOpenChange}
        areaId={areaId}
        versions={versions}
        changes={changes}
      />
      <CreateVersionDialog
        open={ui.showCreateVersion}
        onOpenChange={handleVersionOpenChange}
        areaId={areaId}
        onVersionCreated={handleVersionCreated}
      />
      <LayerMergeDialog
        open={ui.showLayerMerge}
        onOpenChange={handleMergeOpenChange}
        areaId={areaId}
        layers={layers}
        onMergeComplete={handleMergeComplete}
      />

      {/* Keyboard shortcuts help dialog */}
      <Dialog
        open={ui.showKeyboardHelp}
        onOpenChange={handleKeyboardHelpOpenChange}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tastaturkürzel</DialogTitle>
            <DialogDescription>Alle verfügbaren Shortcuts in der Kartenansicht</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {[
              { keys: ["Alt", "↑ / ↓"], desc: "Gebiet wechseln" },
              { keys: ["Esc"], desc: "Zeichenmodus beenden" },
              { keys: ["Enter"], desc: "Polygon abschließen" },
              { keys: ["Backspace"], desc: "Letzten Punkt löschen" },
              { keys: ["Z"], desc: "Cursor-Modus" },
              { keys: ["L"], desc: "Lasso-Modus" },
              { keys: ["C"], desc: "Kursor-Modus (Kreis)" },
              { keys: ["R"], desc: "Rechteck zeichnen" },
            ].map(({ keys, desc }) => (
              <div key={desc} className="flex items-center justify-between">
                <span className="text-muted-foreground">{desc}</span>
                <span className="flex gap-1">
                  {keys.map((k) => (
                    <kbd
                      key={k}
                      className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border rounded"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={form.showDeleteDialog}
        onOpenChange={handleDeleteOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gebiet löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie dieses Gebiet wirklich löschen? Diese Aktion kann
              nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseDelete}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteLayer}
              variant="destructive"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
LayerDialogs.displayName = "LayerDialogs";

function DrawingToolsImpl({
  currentMode,
  onClearAll,
  onToggleVisibility,
  granularity,
  onGranularityChange,
  postalCodesData,
  pendingPostalCodes = EMPTY_ARRAY,
  onAddPending,
  onRemovePending,
  areaId,
  areaName,
  activeLayerId,
  onLayerSelect,
  layers = EMPTY_ARRAY,
  onLayerUpdate,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
  isViewingVersion = false,
  isLayerSwitchPending = false,
  country,
  versions = EMPTY_ARRAY,
  changes = EMPTY_ARRAY,
  onOpenConflicts,
}: DrawingToolsProps) {
  const {
    optimisticLayers,
    ui,
    dispatchUI,
    form,
    dispatchForm,
    editLayerInputRef,
    handleAddPendingToLayer,
    handleRemovePendingFromLayer,
    handleExportExcel,
    handleExportPDF,
    handleCreateLayer,
    handleColorChange,
    handleOpacityChange,
    handleDeleteLayer,
    confirmDeleteLayer,
    handleRenameLayer,
    handleFillHoles,
    handleToggleVisibility,
    handleSoloLayer,
    handleShowAllLayers,
    handleReassignColors,
    handleReorderLayers,
    handleRemovePostalCodeFromLayer,
    handleNotesChange,
    handleExportGeoJSON,
    handleExportData,
    handleBulkDelete,
    handleBulkVisibility,
  } = useDrawingToolsActions({
    areaId,
    areaName,
    activeLayerId,
    onLayerSelect,
    layers,
    onLayerUpdate,
    addPostalCodesToLayer,
    removePostalCodesFromLayer,
    pendingPostalCodes,
    onAddPending,
    onRemovePending,
    granularity,
    country,
    postalCodesData,
  });

  const handleSetRegionsOpen = useCallback(
    (open: boolean) => dispatchUI({ type: "SET_REGIONS_OPEN", open }),
    [dispatchUI]
  );
  const handleClearAllWithToast = useCallback(() => {
    onClearAll();
    toast.success("Zeichnungen gelöscht", { duration: 2000 });
  }, [onClearAll]);

  const handleDuplicateLayer = useCallback(
    (layerId: number) => {
      if (!areaId) return;
      executeAction(duplicateLayerAction(areaId, layerId), {
        loading: "Dupliziere Layer...",
        success: "Layer dupliziert",
        error: "Duplizieren fehlgeschlagen",
      });
    },
    [areaId]
  );

  // Keyboard shortcut: Alt+ArrowUp/Down switches active layer
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const activeLayerIdRef = useRef(activeLayerId);
  activeLayerIdRef.current = activeLayerId;
  const onLayerSelectRef = useRef(onLayerSelect);
  onLayerSelectRef.current = onLayerSelect;

  const handleOpenKeyboardHelp = useCallback(
    () => dispatchUI({ type: "OPEN_KEYBOARD_HELP" }),
    [dispatchUI]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const currentLayers = layersRef.current;
      if (!currentLayers.length) return;
      const currentIdx = currentLayers.findIndex((l) => l.id === activeLayerIdRef.current);
      const nextIdx = e.key === "ArrowUp"
        ? Math.max(0, (currentIdx === -1 ? 0 : currentIdx) - 1)
        : Math.min(currentLayers.length - 1, (currentIdx === -1 ? 0 : currentIdx) + 1);
      if (nextIdx !== currentIdx) {
        e.preventDefault();
        onLayerSelectRef.current?.(currentLayers[nextIdx].id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleImportDataFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      const text = await file.text();
      const toastId = toast.loading("Importiere Gebiet...");
      const result = await importAreaFromDataAction(text);
      toast.dismiss(toastId);
      if (!result?.success) {
        toast.error(result?.error ?? "Import fehlgeschlagen");
      }
    },
    []
  );

  const importDataFileRef = useRef<HTMLInputElement>(null);

  return (
    <Card
      role="region"
      aria-label="Kartentools-Panel"
      className="gap-2 max-w-md flex flex-col max-h-full min-h-0"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Kartentools</CardTitle>
        {isViewingVersion && (
          <div className="flex items-center gap-2 py-1">
            <Badge
              variant="secondary"
              className="flex items-center gap-1 text-xs"
            >
              <IconHistory className="h-3 w-3" />
              Versionsansicht
            </Badge>
            <span className="text-xs text-muted-foreground">
              Änderungen erstellen neue Version
            </span>
          </div>
        )}
        <CardAction>
          <button
            type="button"
            onClick={handleOpenKeyboardHelp}
            title="Tastaturkürzel anzeigen"
            aria-label="Tastaturkürzel anzeigen"
            className="p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary text-muted-foreground"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleVisibility}
            title="Werkzeugleiste ausblenden"
            aria-label="Werkzeugleiste ausblenden"
            className="ml-auto p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 overflow-y-auto min-h-0 flex-1">
        {/* Granularity Management Section */}
        {granularity && onGranularityChange && (
          <>
            <div className="pb-2">
              <div className="text-xs font-semibold mb-2 flex items-center justify-between">
                <span>PLZ-Granularität</span>
                <Badge variant="outline" className="text-xs">
                  {granularity === "1digit" && "1-stellig"}
                  {granularity === "2digit" && "2-stellig"}
                  {granularity === "3digit" && "3-stellig"}
                  {granularity === "5digit" && "5-stellig"}
                </Badge>
              </div>
              <GranularitySelector
                currentGranularity={granularity}
                onGranularityChange={onGranularityChange}
                areaId={areaId}
                layers={layers}
              />
            </div>
            <Separator />
          </>
        )}

        {/* Layer Management Section - Only show if areaId is provided */}
        {areaId && (
          <LayerManagementSection
            areaId={areaId}
            optimisticLayers={optimisticLayers}
            ui={ui}
            dispatchUI={dispatchUI}
            form={form}
            dispatchForm={dispatchForm}
            editLayerInputRef={editLayerInputRef}
            activeLayerId={activeLayerId}
            isViewingVersion={isViewingVersion}
            isLayerSwitchPending={isLayerSwitchPending}
            onLayerSelect={onLayerSelect}
            handleCreateLayer={handleCreateLayer}
            handleRenameLayer={handleRenameLayer}
            handleColorChange={handleColorChange}
            handleOpacityChange={handleOpacityChange}
            handleDeleteLayer={handleDeleteLayer}
            handleDuplicateLayer={handleDuplicateLayer}
            handleToggleVisibility={handleToggleVisibility}
            handleSoloLayer={handleSoloLayer}
            handleShowAllLayers={handleShowAllLayers}
            handleReassignColors={handleReassignColors}
            handleReorderLayers={handleReorderLayers}
            handleRemovePostalCodeFromLayer={handleRemovePostalCodeFromLayer}
            handleNotesChange={handleNotesChange}
            addPostalCodesToLayer={addPostalCodesToLayer}
            onOpenConflicts={onOpenConflicts}
            handleBulkDelete={handleBulkDelete}
            handleBulkVisibility={handleBulkVisibility}
          />
        )}

        {/* Regions Section */}
        <PendingRegionsSection
          pendingPostalCodes={pendingPostalCodes}
          regionsOpen={ui.regionsOpen}
          onOpenChange={handleSetRegionsOpen}
          canAdd={!!(areaId && activeLayerId && addPostalCodesToLayer)}
          canRemove={!!(areaId && activeLayerId && removePostalCodesFromLayer)}
          onAddPending={handleAddPendingToLayer}
          onRemovePending={handleRemovePendingFromLayer}
        />

        {/* Actions + Export Section */}
        <DrawingActionsSection
          currentMode={currentMode}
          postalCodesData={postalCodesData}
          activeLayerId={activeLayerId}
          areaId={areaId}
          isFilling={ui.isFilling}
          onFillHoles={handleFillHoles}
          onClearAll={handleClearAllWithToast}
          onExportExcel={handleExportExcel}
          onExportPDF={handleExportPDF}
          onExportGeoJSON={handleExportGeoJSON}
          onExportData={handleExportData}
        />

        {/* Import JSON — creates a new area from JSON backup */}
        <div className="flex justify-end">
          <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <Upload className="h-3 w-3" />
            <span>Gebiet aus JSON importieren</span>
            <input
              ref={importDataFileRef}
              type="file"
              accept=".json"
              className="sr-only"
              onChange={handleImportDataFile}
            />
          </label>
        </div>

        {/* Stats Section */}
        {postalCodesData && (
          <StatsSection
            layers={optimisticLayers}
            postalCodesData={postalCodesData}
          />
        )}

        {/* Layer Dialogs */}
        {areaId && (
          <LayerDialogs
            areaId={areaId}
            ui={ui}
            dispatchUI={dispatchUI}
            form={form}
            dispatchForm={dispatchForm}
            layers={layers}
            versions={versions}
            changes={changes}
            onLayerUpdate={onLayerUpdate}
            confirmDeleteLayer={confirmDeleteLayer}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function DrawingTools(props: DrawingToolsProps) {
  return (
    <Suspense
      fallback={<Skeleton className="w-full h-full min-h-50 rounded-lg" />}
    >
      <DrawingToolsImpl {...props} />
    </Suspense>
  );
}
