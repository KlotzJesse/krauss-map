"use client";

import {
  IconPlus,
  IconPalette,
  IconAlertTriangle,
  IconClock,
  IconDeviceFloppy,
  IconGitMerge,
  IconHistory,
} from "@tabler/icons-react";
import type { InferSelectModel } from "drizzle-orm";
import type {
  FeatureCollection,
  GeoJsonProperties,
  MultiPolygon,
  Polygon,
} from "geojson";
import {
  Copy,
  Diamond,
  FileSpreadsheet,
  Loader2Icon,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Suspense,
  useState,
  useEffect,
  Activity,
  useOptimistic,
  useTransition,
} from "react";
import { toast } from "sonner";

import {
  createLayerAction,
  updateLayerAction,
  deleteLayerAction,
} from "@/app/actions/area-actions";
import { ConflictResolutionDialog } from "@/components/areas/conflict-resolution-dialog";
import { CreateVersionDialog } from "@/components/areas/create-version-dialog";
import { EnhancedVersionHistoryDialog } from "@/components/areas/enhanced-version-history-dialog";
import { LayerMergeDialog } from "@/components/areas/layer-merge-dialog";
import { GranularitySelector } from "@/components/shared/granularity-selector";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TerraDrawMode } from "@/lib/hooks/use-terradraw";
import type {
  SelectAreaVersions,
  SelectAreaChanges,
  areaLayers,
} from "@/lib/schema/schema";
import {
  copyPostalCodesCSV,
  exportLayersXLSX,
  exportLayersPDF,
} from "@/lib/utils/export-utils";

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

  postalCodesData?: FeatureCollection<
    Polygon | MultiPolygon,
    GeoJsonProperties
  >;

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

  // Version and change data for dialogs

  versions: SelectAreaVersions[];

  changes: SelectAreaChanges[];
}

const DEFAULT_COLORS = [
  "#3b82f6", // blue

  "#ef4444", // red

  "#10b981", // green

  "#f59e0b", // amber

  "#8b5cf6", // purple

  "#ec4899", // pink

  "#14b8a6", // teal

  "#f97316", // orange
];

// Fill logic using server-side geoprocessing API

async function fillRegions(
  mode: "all" | "holes" | "expand",

  _postalCodesData: FeatureCollection<
    Polygon | MultiPolygon,
    GeoJsonProperties
  >,

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

      console.log(
        "Filling regions with mode:",

        mode,

        "granularity:",

        granularity,

        "layer codes:",

        layerCodes
      );

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
    } finally {
      setIsFilling(false);
    }
  };

  toast.promise(fillPromise(), {
    loading: "Geoverarbeitung läuft...",

    success: (message) => message,

    error: "Fehler bei der Geoverarbeitung",
  });
}

function DrawingToolsImpl({
  currentMode,

  onClearAll,

  onToggleVisibility,

  granularity,

  onGranularityChange,

  postalCodesData,

  pendingPostalCodes = [],

  onAddPending,

  onRemovePending,

  areaId,

  areaName,

  activeLayerId,

  onLayerSelect,

  layers = [],

  onLayerUpdate,

  addPostalCodesToLayer,

  removePostalCodesFromLayer,

  isViewingVersion = false,

  versions = [],

  changes = [],
}: DrawingToolsProps) {
  // Optimistic layer state for instant UI updates
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

  // Collapsible section states

  const [layersOpen, setLayersOpen] = useState(areaId ? true : false);

  const [regionsOpen, setRegionsOpen] = useState(false);

  const [actionsOpen, setActionsOpen] = useState(false);

  // Auto-expand regions section when there are pending postal codes

  useEffect(() => {
    if (pendingPostalCodes.length > 0) {
      setRegionsOpen(true);
    }
  }, [pendingPostalCodes.length]);

  // Auto-expand actions section when in drawing mode

  useEffect(() => {
    const isDrawingMode =
      currentMode !== null &&
      [
        "freehand",

        "circle",

        "rectangle",

        "polygon",

        "point",

        "linestring",

        "angled-rectangle",
      ].includes(currentMode);

    if (isDrawingMode) {
      setActionsOpen(true);
    }
  }, [currentMode]);

  // Layer management state

  const [newLayerName, setNewLayerName] = useState("");

  const [isCreating, setIsCreating] = useState(false);

  const [editingLayerId, setEditingLayerId] = useState<number | null>(null);

  const [editingLayerName, setEditingLayerName] = useState("");

  const [showConflicts, setShowConflicts] = useState(false);

  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const [showCreateVersion, setShowCreateVersion] = useState(false);

  const [showLayerMerge, setShowLayerMerge] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [layerToDelete, setLayerToDelete] = useState<number | null>(null);

  // Server action implementations

  const createLayer = async (data: {
    name: string;

    color: string;

    orderIndex: number;
  }) => {
    if (!areaId) return;

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
    if (!areaId) return;

    const result = await updateLayerAction(areaId, layerId, data);

    if (result.success) {
      onLayerUpdate?.();
    } else {
      throw new Error(result.error);
    }
  };

  const deleteLayer = async (layerId: number) => {
    if (!areaId) return;

    const result = await deleteLayerAction(areaId, layerId);

    if (result.success) {
      onLayerUpdate?.();
    } else {
      throw new Error(result.error);
    }
  };

  const updateLayerColor = async (layerId: number, color: string) => {
    await updateLayer(layerId, { color });
  };

  // Create handlers for adding/removing pending postal codes to/from active layer

  const handleAddPendingToLayer = async () => {
    console.log("[handleAddPendingToLayer] Called with:", {
      areaId,

      activeLayerId,

      pendingCount: pendingPostalCodes.length,

      addFunction: !!addPostalCodesToLayer,
    });

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

    try {
      console.log(
        "[handleAddPendingToLayer] Adding codes:",

        pendingPostalCodes
      );

      await addPostalCodesToLayer(activeLayerId, pendingPostalCodes);

      toast.success(
        `${pendingPostalCodes.length} Region${
          pendingPostalCodes.length === 1 ? "" : "en"
        } zu Gebiet hinzugefügt`,

        { duration: 2000 }
      );

      // Call the original onAddPending to clear the pending codes

      onAddPending?.();
    } catch (error) {
      console.error("Error adding pending codes to layer:", error);

      toast.error("Fehler beim Hinzufügen der Regionen", { duration: 2000 });
    }
  };

  const handleRemovePendingFromLayer = async () => {
    console.log("[handleRemovePendingFromLayer] Called with:", {
      areaId,

      activeLayerId,

      pendingCount: pendingPostalCodes.length,

      removeFunction: !!removePostalCodesFromLayer,
    });

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

    try {
      console.log(
        "[handleRemovePendingFromLayer] Removing codes:",

        pendingPostalCodes
      );

      await removePostalCodesFromLayer(activeLayerId, pendingPostalCodes);

      toast.success(
        `${pendingPostalCodes.length} Region${
          pendingPostalCodes.length === 1 ? "" : "en"
        } aus Gebiet entfernt`,

        { duration: 2000 }
      );

      // Call the original onRemovePending to clear the pending codes

      onRemovePending?.();
    } catch (error) {
      console.error("Error removing pending codes from layer:", error);

      toast.error("Fehler beim Entfernen der Regionen", { duration: 2000 });
    }
  };

  useEffect(() => {
    // Layer data now comes from props passed by server component

    if (areaId) {
      console.log(
        "Drawing tools area changed to:",

        areaId,

        "- layers provided via props:",

        optimisticLayers.length
      );
    }
  }, [areaId, optimisticLayers.length]);

  // Export as Excel with multiple sheets per layer

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

  // Copy as CSV - moved to per-layer buttons

  // const handleCopyCSV = async () => {

  //   const codes = getPostalCodes();

  //   await copyPostalCodesCSV(codes);

  // };

  // Export as PDF with CSV list format

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

  // --- UI State ---

  const [isFilling, setIsFilling] = useState(false);

  const handleCreateLayer = async () => {
    if (!newLayerName.trim()) return;

    setIsCreating(true);

    startTransition(async () => {
      const nextColor =
        DEFAULT_COLORS[optimisticLayers.length % DEFAULT_COLORS.length];
      const createdLayerName = newLayerName;

      // Optimistic update
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

      setNewLayerName("");

      try {
        await toast.promise(
          createLayer({
            name: createdLayerName,
            color: nextColor,
            orderIndex: optimisticLayers.length,
          }).then((result) => {
            // Set the newly created layer as active
            if (result?.id && onLayerSelect) {
              onLayerSelect(result.id);
            }
            return result;
          }),
          {
            loading: `Erstelle Gebiet "${createdLayerName}"...`,
            success: `Gebiet "${createdLayerName}" erstellt`,
            error: "Fehler beim Erstellen - Bitte erneut versuchen",
          }
        );
      } finally {
        setIsCreating(false);
      }
    });
  };

  const handleColorChange = async (layerId: number, color: string) => {
    startTransition(async () => {
      // Optimistic update
      updateOptimisticLayers({ type: "update", id: layerId, layer: { color } });

      // Instant visual feedback - no need for toast, color changes are self-evident

      try {
        await updateLayerColor(layerId, color);
        // Success - optimistic update was correct
      } catch (error) {
        console.error("Error updating layer color:", error);
        toast.error("Fehler beim Ändern der Farbe - Bitte erneut versuchen");
      }
    });
  };

  const handleDeleteLayer = async (layerId: number) => {
    setLayerToDelete(layerId);

    setShowDeleteDialog(true);
  };

  const confirmDeleteLayer = async () => {
    if (!layerToDelete || !deleteLayer) return;

    startTransition(async () => {
      // Optimistic update
      updateOptimisticLayers({ type: "delete", id: layerToDelete });

      setShowDeleteDialog(false);
      const deletedLayerId = layerToDelete;
      setLayerToDelete(null);

      await toast.promise(deleteLayer(deletedLayerId), {
        loading: "Lösche Gebiet...",
        success: "Gebiet gelöscht",
        error: "Fehler beim Löschen - Änderung wird rückgängig gemacht",
      });
    });
  };

  const handleRenameLayer = async (layerId: number, newName: string) => {
    if (!newName.trim()) {
      toast.error("Gebiets-Name darf nicht leer sein");

      return;
    }

    startTransition(async () => {
      // Optimistic update - instantly rename in UI
      updateOptimisticLayers({
        type: "update",
        id: layerId,
        layer: { name: newName.trim() },
      });

      setEditingLayerId(null);
      setEditingLayerName("");

      await toast.promise(updateLayer(layerId, { name: newName.trim() }), {
        loading: "Benenne Gebiet um...",
        success: "Gebiet umbenannt",
        error: "Fehler beim Umbenennen - Bitte erneut versuchen",
      });
    });
  };

  return (
    <Card
      role="region"
      aria-label="Kartentools-Panel"
      className="gap-2 max-w-md"
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
      <CardContent className="space-y-2">
        {/* Granularity Management Section */}
        {granularity && onGranularityChange && (
          <>
            <Collapsible open={true}>
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
            </Collapsible>
            <Separator />
          </>
        )}

        {/* Layer Management Section - Only show if areaId is provided */}
        {areaId && (
          <>
            <Collapsible open={layersOpen} onOpenChange={setLayersOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between h-7 px-2 text-xs font-semibold"
                >
                  <span>Gebiete ({optimisticLayers.length})</span>
                  {layersOpen ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {/* Layer action buttons */}
                <div className="grid grid-cols-4 gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setShowConflicts(true)}
                        variant="outline"
                        size="sm"
                        className="h-7 px-1.5"
                      >
                        <IconAlertTriangle className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Konflikte anzeigen und lösen</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setShowVersionHistory(true)}
                        variant="outline"
                        size="sm"
                        className="h-7 px-1.5"
                      >
                        <IconClock className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Versionsverlauf anzeigen</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setShowCreateVersion(true)}
                        variant="outline"
                        size="sm"
                        className="h-7 px-1.5"
                      >
                        <IconDeviceFloppy className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Neue Version erstellen</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setShowLayerMerge(true)}
                        variant="outline"
                        size="sm"
                        className="h-7 px-1.5"
                      >
                        <IconGitMerge className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Gebiete zusammenführen</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Create new layer */}
                <div className="flex gap-1">
                  <Input
                    value={newLayerName}
                    onChange={(e) => setNewLayerName(e.target.value)}
                    placeholder={
                      isViewingVersion
                        ? "Neues Gebiet (neue Version)..."
                        : "Neues Gebiet..."
                    }
                    className="h-7 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateLayer();
                      }
                    }}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleCreateLayer}
                        disabled={!newLayerName.trim() || isCreating}
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
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Neues Gebiet erstellen</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Layer list - Optimized with shadcn */}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {optimisticLayers.map((layer) => (
                    <div
                      key={layer.id}
                      className={`group relative rounded-lg border transition-all ${
                        activeLayerId === layer.id
                          ? "border-primary bg-accent shadow-sm"
                          : "border-border hover:border-primary/50 hover:bg-accent/50"
                      }`}
                    >
                      <div
                        className="px-3 py-2 cursor-pointer"
                        onClick={() => onLayerSelect?.(layer.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {/* Layer info */}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {/* Color indicator */}
                            <div
                              className="w-3 h-3 rounded-sm flex-shrink-0 border border-border"
                              style={{ backgroundColor: layer.color }}
                            />

                            {/* Name - editable on double-click */}
                            {editingLayerId === layer.id ? (
                              <Input
                                value={editingLayerName}
                                onChange={(e) =>
                                  setEditingLayerName(e.target.value)
                                }
                                className="h-6 text-sm flex-1"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  e.stopPropagation();

                                  if (e.key === "Enter") {
                                    handleRenameLayer(
                                      layer.id,

                                      editingLayerName
                                    );
                                  } else if (e.key === "Escape") {
                                    setEditingLayerId(null);

                                    setEditingLayerName("");
                                  }
                                }}
                                onBlur={() => {
                                  if (editingLayerName.trim()) {
                                    handleRenameLayer(
                                      layer.id,

                                      editingLayerName
                                    );
                                  } else {
                                    setEditingLayerId(null);

                                    setEditingLayerName("");
                                  }
                                }}
                              />
                            ) : (
                              <span
                                className="font-medium text-sm truncate"
                                onDoubleClick={(e) => {
                                  e.stopPropagation();

                                  setEditingLayerId(layer.id);

                                  setEditingLayerName(layer.name);
                                }}
                                title="Doppelklick zum Umbenennen"
                              >
                                {layer.name}
                              </span>
                            )}

                            {/* Postal code count */}
                            <Badge variant="secondary" className="text-xs">
                              {layer.postalCodes?.length || 0}
                            </Badge>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Color picker */}
                            <Popover>
                              <PopoverTrigger asChild>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <IconPalette className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Gebiet-Farbe ändern</p>
                                  </TooltipContent>
                                </Tooltip>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-3"
                                onClick={(e: React.MouseEvent) =>
                                  e.stopPropagation()
                                }
                              >
                                <div className="grid grid-cols-4 gap-2">
                                  {DEFAULT_COLORS.map((color) => (
                                    <button
                                      key={color}
                                      className="w-8 h-8 rounded-md border-2 hover:scale-110 transition-transform"
                                      style={{
                                        backgroundColor: color,

                                        borderColor:
                                          layer.color === color
                                            ? "currentColor"
                                            : "transparent",
                                      }}
                                      onClick={() =>
                                        handleColorChange(layer.id, color)
                                      }
                                    />
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                            {/* Copy as CSV */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={async (e) => {
                                    e.stopPropagation();

                                    const codes =
                                      layer.postalCodes?.map(
                                        (pc) => `D-${pc.postalCode}`
                                      ) || [];

                                    if (codes.length > 0) {
                                      await copyPostalCodesCSV(codes);
                                    } else {
                                      toast.info(
                                        "Keine Postleitzahlen zum Kopieren"
                                      );
                                    }
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Postleitzahlen als CSV kopieren</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* Delete */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.stopPropagation();

                                    handleDeleteLayer(layer.id);
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Gebiet löschen</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
            <Separator />
          </>
        )}

        {/* Regions Section */}
        <Collapsible
          open={regionsOpen}
          onOpenChange={setRegionsOpen}
          className="space-y-2"
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between h-7 px-2 text-xs font-semibold"
            >
              <span>Regionen ({pendingPostalCodes.length})</span>
              {regionsOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {/* Gefundene Regionen durch Zeichnung */}
            <Activity
              mode={pendingPostalCodes.length > 0 ? "visible" : "hidden"}
            >
              <div className="space-y-1.5">
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs font-medium">Gefunden</span>
                  <span className="text-xs text-muted-foreground">
                    {pendingPostalCodes.length}
                  </span>
                </div>
                <div className="max-h-20 overflow-y-auto space-y-0.5">
                  {pendingPostalCodes.slice(0, 5).map((region: string) => (
                    <div
                      key={region}
                      className="text-xs p-1 bg-muted rounded truncate"
                    >
                      {region}
                    </div>
                  ))}
                  <Activity
                    mode={pendingPostalCodes.length > 5 ? "visible" : "hidden"}
                  >
                    <div className="text-xs text-muted-foreground text-center py-0.5">
                      +{pendingPostalCodes.length - 5}
                    </div>
                  </Activity>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleAddPendingToLayer}
                    className="h-6 text-xs"
                    title="Gefundene zum aktiven Gebiet hinzufügen"
                    disabled={
                      !areaId || !activeLayerId || !addPostalCodesToLayer
                    }
                  >
                    Hinzufügen
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemovePendingFromLayer}
                    className="h-6 text-xs"
                    title="Gefundene aus aktivem Layer entfernen"
                    disabled={
                      !areaId || !activeLayerId || !removePostalCodesFromLayer
                    }
                  >
                    Entfernen
                  </Button>
                </div>
                <Separator />
              </div>
            </Activity>
          </CollapsibleContent>
        </Collapsible>

        {/* Actions Section */}
        {currentMode !== null &&
          [
            "freehand",

            "circle",

            "rectangle",

            "polygon",

            "point",

            "linestring",

            "angled-rectangle",
          ].includes(currentMode) && (
            <>
              <Separator />
              <Collapsible
                open={actionsOpen}
                onOpenChange={setActionsOpen}
                className="space-y-2"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between h-7 px-2 text-xs font-semibold"
                  >
                    <span>Aktionen</span>
                    {actionsOpen ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pt-2">
                  {currentMode !== null &&
                    [
                      "freehand",

                      "circle",

                      "rectangle",

                      "polygon",

                      "point",

                      "linestring",

                      "angled-rectangle",
                    ].includes(currentMode) && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          onClearAll();

                          toast.success("🗑️ Zeichnungen gelöscht", {
                            duration: 2000,
                          });
                        }}
                        className="w-full h-7 text-xs"
                      >
                        <X className="h-3 w-3 mr-1.5" />
                        Zeichnung löschen
                      </Button>
                    )}
                  <Activity
                    mode={!!(activeLayerId && areaId) ? "visible" : "hidden"}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={
                        isFilling ||
                        !optimisticLayers.find((l) => l.id === activeLayerId)
                      }
                      onClick={() => {
                        const activeLayer = optimisticLayers.find(
                          (l) => l.id === activeLayerId
                        );

                        if (postalCodesData && activeLayer) {
                          fillRegions(
                            "holes",

                            postalCodesData,

                            activeLayer,

                            addPostalCodesToLayer ?? (async () => {}),

                            setIsFilling,

                            granularity
                          );
                        }
                      }}
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
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

        {/* Export Section */}
        <Activity mode={!!postalCodesData ? "visible" : "hidden"}>
          <>
            <Separator />
            <div className="space-y-1">
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportExcel}
                      className="flex-1 h-7 text-xs"
                    >
                      <FileSpreadsheet className="h-3 w-3 mr-1" />
                      XLS
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Als Excel-Datei exportieren</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportPDF}
                      className="flex-1 h-7 text-xs"
                    >
                      📄 PDF
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Als PDF-Datei exportieren</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </>
        </Activity>

        {/* Layer Dialogs */}
        {areaId && (
          <>
            <ConflictResolutionDialog
              open={showConflicts}
              onOpenChange={setShowConflicts}
              areaId={areaId}
              layers={layers}
            />
            <EnhancedVersionHistoryDialog
              open={showVersionHistory}
              onOpenChange={setShowVersionHistory}
              areaId={areaId}
              versions={versions}
              changes={changes}
            />
            <CreateVersionDialog
              open={showCreateVersion}
              onOpenChange={setShowCreateVersion}
              areaId={areaId}
              onVersionCreated={() => {
                onLayerUpdate?.();
              }}
            />
            <LayerMergeDialog
              open={showLayerMerge}
              onOpenChange={setShowLayerMerge}
              areaId={areaId}
              layers={layers}
              onMergeComplete={() => {
                onLayerUpdate?.();
              }}
            />
            <AlertDialog
              open={showDeleteDialog}
              onOpenChange={setShowDeleteDialog}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Gebiet löschen</AlertDialogTitle>
                  <AlertDialogDescription>
                    Möchten Sie dieses Gebiet wirklich löschen? Diese Aktion
                    kann nicht rückgängig gemacht werden.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setShowDeleteDialog(false)}>
                    Abbrechen
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={confirmDeleteLayer}>
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function DrawingTools(props: DrawingToolsProps) {
  return (
    <Suspense
      fallback={<Skeleton className="w-full h-full min-h-[200px] rounded-lg" />}
    >
      <DrawingToolsImpl {...props} />
    </Suspense>
  );
}
