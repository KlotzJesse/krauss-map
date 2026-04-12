"use client";

import {
  IconAlertTriangle,
  IconClock,
  IconDeviceFloppy,
  IconGitMerge,
  IconHistory,
  IconPlus,
} from "@tabler/icons-react";
import type { InferSelectModel } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { Dispatch, RefObject } from "react";
import {
  Suspense,
  useCallback,
  useOptimistic,
  useReducer,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import {
  createLayerAction,
  deleteLayerAction,
  updateLayerAction,
} from "@/app/actions/area-actions";
import { ConflictResolutionDialog } from "@/components/areas/conflict-resolution-dialog";
import { CreateVersionDialog } from "@/components/areas/create-version-dialog";
import { EnhancedVersionHistoryDialog } from "@/components/areas/enhanced-version-history-dialog";
import { LayerMergeDialog } from "@/components/areas/layer-merge-dialog";
import { DrawingActionsSection } from "@/components/shared/drawing-actions-section";
import { GranularitySelector } from "@/components/shared/granularity-selector";
import {
  DEFAULT_LAYER_COLORS,
  LayerListItem,
} from "@/components/shared/layer-list-item";
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
  SelectAreaChanges,
  SelectAreaVersions,
  areaLayers,
} from "@/lib/schema/schema";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";
import { exportLayersPDF, exportLayersXLSX } from "@/lib/utils/export-utils";

const EMPTY_ARRAY: never[] = [];

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

  versions: SelectAreaVersions[];

  changes: SelectAreaChanges[];
}

// --- UI state reducer ---

interface DrawingToolsUIState {
  layersOpen: boolean;
  regionsOpen: boolean;
  showConflicts: boolean;
  showVersionHistory: boolean;
  showCreateVersion: boolean;
  showLayerMerge: boolean;
  isFilling: boolean;
}

type DrawingToolsUIAction =
  | { type: "SET_LAYERS_OPEN"; open: boolean }
  | { type: "SET_REGIONS_OPEN"; open: boolean }
  | { type: "OPEN_CONFLICTS" }
  | { type: "CLOSE_CONFLICTS" }
  | { type: "OPEN_HISTORY" }
  | { type: "CLOSE_HISTORY" }
  | { type: "OPEN_VERSION" }
  | { type: "CLOSE_VERSION" }
  | { type: "OPEN_MERGE" }
  | { type: "CLOSE_MERGE" }
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
    case "OPEN_CONFLICTS": {
      return { ...state, showConflicts: true };
    }
    case "CLOSE_CONFLICTS": {
      return { ...state, showConflicts: false };
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

  _postalCodesData: FeatureCollection<Polygon | MultiPolygon>,

  activeLayer: Layer,

  addPostalCodesToLayer: (layerId: number, codes: string[]) => Promise<void>,

  setIsFilling: (b: boolean) => void,

  granularity?: string
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
    } catch (error) {
      console.error(error);
    }
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
  postalCodesData,
}: UseDrawingToolsActionsProps) {
  const [optimisticLayers, updateOptimisticLayers] = useOptimistic(
    layers,
    (
      currentLayers: Layer[],
      update: {
        type: "create" | "update" | "delete";
        layer?: Partial<Layer>;
        id?: number;
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
      return currentLayers;
    }
  );

  const [_isPending, startTransition] = useTransition();

  const [ui, dispatchUI] = useReducer(drawingToolsUIReducer, {
    layersOpen: !!areaId,
    regionsOpen: false,
    showConflicts: false,
    showVersionHistory: false,
    showCreateVersion: false,
    showLayerMerge: false,
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
      opacity: 100,
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
    } catch (error) {
      console.error("Error adding pending codes to layer:", error);
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
    } catch (error) {
      console.error("Error removing pending codes from layer:", error);
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

  const handleCreateLayer = async () => {
    if (!form.newLayerName.trim()) {
      return;
    }
    dispatchForm({ type: "START_CREATING" });
    startTransition(async () => {
      const nextColor =
        DEFAULT_LAYER_COLORS[
          optimisticLayers.length % DEFAULT_LAYER_COLORS.length
        ];
      const createdLayerName = form.newLayerName;
      updateOptimisticLayers({
        type: "create",
        layer: {
          name: createdLayerName,
          color: nextColor,
          opacity: 100,
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
      } catch (error) {
        console.error("Error updating layer color:", error);
        toast.error("Fehler beim Ändern der Farbe - Bitte erneut versuchen");
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
    if (!newName.trim()) {
      toast.error("Gebiets-Name darf nicht leer sein");
      return;
    }
    startTransition(async () => {
      updateOptimisticLayers({
        type: "update",
        id: layerId,
        layer: { name: newName.trim() },
      });
      dispatchForm({ type: "CANCEL_EDIT" });
      try {
        await executeAction(updateLayer(layerId, { name: newName.trim() }), {
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
        postalCodesData,
        activeLayer,
        addPostalCodesToLayer ?? (async () => {}),
        (v) => dispatchUI({ type: "SET_FILLING", value: v }),
        granularity
      );
    }
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
  };
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
  handleDeleteLayer: (layerId: number) => void;
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
  handleDeleteLayer,
}: LayerManagementSectionProps) {
  // Stabilize dispatch callbacks to prevent Button/TooltipTrigger re-renders
  const handleOpenConflicts = useCallback(
    () => dispatchUI({ type: "OPEN_CONFLICTS" }),
    [dispatchUI]
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

  return (
    <>
      <Collapsible open={ui.layersOpen} onOpenChange={handleSetLayersOpen}>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between h-7 px-2 text-xs font-semibold"
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
        <CollapsibleContent className="space-y-2 pt-2">
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

          {/* Layer list */}
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {optimisticLayers.map((layer) => (
              <LayerListItem
                key={layer.id}
                layer={layer}
                activeLayerId={activeLayerId}
                isLayerSwitchPending={isLayerSwitchPending}
                editingLayerId={form.editingLayerId}
                editingLayerName={form.editingLayerName}
                editLayerInputRef={editLayerInputRef}
                onSelect={(id) => onLayerSelect?.(id)}
                onStartEdit={(id, name) =>
                  dispatchForm({ type: "START_EDIT", layerId: id, name })
                }
                onConfirmEdit={handleRenameLayer}
                onCancelEdit={() => dispatchForm({ type: "CANCEL_EDIT" })}
                onEditNameChange={(name) =>
                  dispatchForm({ type: "SET_EDIT_NAME", name })
                }
                onColorChange={handleColorChange}
                onDelete={handleDeleteLayer}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
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

function LayerDialogs({
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
  return (
    <>
      <ConflictResolutionDialog
        open={ui.showConflicts}
        onOpenChange={(open) =>
          dispatchUI(
            open ? { type: "OPEN_CONFLICTS" } : { type: "CLOSE_CONFLICTS" }
          )
        }
        areaId={areaId}
        layers={layers}
      />
      <EnhancedVersionHistoryDialog
        open={ui.showVersionHistory}
        onOpenChange={(open) =>
          dispatchUI(
            open ? { type: "OPEN_HISTORY" } : { type: "CLOSE_HISTORY" }
          )
        }
        areaId={areaId}
        versions={versions}
        changes={changes}
      />
      <CreateVersionDialog
        open={ui.showCreateVersion}
        onOpenChange={(open) =>
          dispatchUI(
            open ? { type: "OPEN_VERSION" } : { type: "CLOSE_VERSION" }
          )
        }
        areaId={areaId}
        onVersionCreated={() => onLayerUpdate?.()}
      />
      <LayerMergeDialog
        open={ui.showLayerMerge}
        onOpenChange={(open) =>
          dispatchUI(open ? { type: "OPEN_MERGE" } : { type: "CLOSE_MERGE" })
        }
        areaId={areaId}
        layers={layers}
        onMergeComplete={() => onLayerUpdate?.()}
      />
      <AlertDialog
        open={form.showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            dispatchForm({ type: "CLOSE_DELETE" });
          }
        }}
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
            <AlertDialogCancel
              onClick={() => dispatchForm({ type: "CLOSE_DELETE" })}
            >
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteLayer}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
  versions = EMPTY_ARRAY,
  changes = EMPTY_ARRAY,
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
    handleDeleteLayer,
    confirmDeleteLayer,
    handleRenameLayer,
    handleFillHoles,
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
            handleDeleteLayer={handleDeleteLayer}
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
        />

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
