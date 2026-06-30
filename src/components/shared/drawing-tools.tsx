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
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconClock,
  IconDeviceFloppy,
  IconDots,
  IconGitMerge,
  IconHistory,
  IconLayoutColumns,
  IconPlus,
} from "@tabler/icons-react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
  ArrowDownUp,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  HelpCircle,
  MapPin,
  Palette,
  Redo2,
  Search,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
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
  copyLayerToAreaAction,
  updateLayerAction,
  updateAreaAction,
  exportAreaGeoJSONAction,
  exportAreaDataAction,
  importAreaFromDataAction,
  fixDuplicateCodeAction,
  fixDuplicateWithLayerAction,
  addPostalCodesByPrefixAction,
  splitLayerAction,
} from "@/app/actions/area-actions";
import {
  redoChangeAction,
  undoChangeAction,
} from "@/app/actions/change-tracking-actions";
import {
  batchUpdateVisibilityAction,
  mergeLayersAction,
  removePostalCodesByCountryAction,
} from "@/app/actions/layer-actions";
import { AreaTagsManager } from "@/components/areas/area-tags-manager";
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
  DropdownMenuGroup,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type CountryCode,
  detectCountryFromCode,
  formatWithPrefix,
} from "@/lib/config/countries";
import { useLayerFormState } from "@/lib/hooks/use-layer-form-state";
import { useLockedLayers } from "@/lib/hooks/use-locked-layers";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { TerraDrawMode } from "@/lib/hooks/use-terradraw";
import type { ChangeSummary, VersionSummary } from "@/lib/schema/schema";
import type { Layer } from "@/lib/types/area-types";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";
import { storedCodeToCompositeKey } from "@/lib/utils/deck-gl-utils";
import {
  copyPostalCodesCSV,
  downloadLayerCSV,
  exportLayersPDF,
  exportLayersXLSX,
} from "@/lib/utils/export-utils";
import {
  COLOR_THEMES,
  generateNextColor,
  hashGroupColor,
  reassignAllColors,
} from "@/lib/utils/layer-colors";

const EMPTY_ARRAY: never[] = [];

// Stable DnD config — defined outside components to avoid re-renders on each render cycle
const DND_MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 5 } };

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
const LayerTemplatesDialog = dynamic(
  () =>
    import("@/components/areas/layer-templates-dialog").then(
      (m) => m.LayerTemplatesDialog
    ),
  { ssr: false }
);
const CopyLayerToAreaDialog = dynamic(
  () =>
    import("@/components/areas/copy-layer-to-area-dialog").then(
      (m) => m.CopyLayerToAreaDialog
    ),
  { ssr: false }
);
const MergeLayersDialog = dynamic(
  () =>
    import("@/components/areas/merge-layers-dialog").then(
      (m) => m.MergeLayersDialog
    ),
  { ssr: false }
);

const StatsSection = dynamic(
  () =>
    import("./drawing-tools-stats").then((m) => m.StatsSection),
  { ssr: false }
);

const LänderSection = dynamic(
  () =>
    import("./drawing-tools-lander").then((m) => m.LänderSection),
  { ssr: false }
);

const LayerManagementSection = dynamic(
  () =>
    import("./drawing-tools-layers").then((m) => m.LayerManagementSection),
  {
    ssr: false,
    loading: () => (
      <div className="h-8 animate-pulse bg-muted rounded" />
    ),
  }
);


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

  areaDescription?: string | null; // Optional area description, editable inline

  /** Tags assigned to this area — shown inline below area name. */
  areaTags?: { id: number; name: string; color: string }[];

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

  // Undo/redo status (from server)
  undoRedoStatus?: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };

  // Version and change data for dialogs

  versions: VersionSummary[];

  changes: ChangeSummary[];

  /** Callback to open the conflict resolution panel (managed by parent). */
  onOpenConflicts?: () => void;

  /** Callback to set the hovered PLZ for map preview. */
  onPreviewPostalCode?: (postalCode: string | null) => void;
  /** Callback to zoom the map to a layer's postal code extent. */
  onZoomToLayer?: (layerId: number) => void;
  /** Callback to highlight specific postal codes on the map (e.g. for prefix preview). */
  onHighlightCodes?: (codes: Set<string> | null) => void;
}

// --- UI state reducer ---

export interface DrawingToolsUIState {
  layersOpen: boolean;
  regionsOpen: boolean;
  statsOpen: boolean;
  showVersionHistory: boolean;
  showCreateVersion: boolean;
  showLayerMerge: boolean;
  showKeyboardHelp: boolean;
  isFilling: boolean;
}

export type DrawingToolsUIAction =
  | { type: "SET_LAYERS_OPEN"; open: boolean }
  | { type: "SET_REGIONS_OPEN"; open: boolean }
  | { type: "SET_STATS_OPEN"; open: boolean }
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
    case "SET_STATS_OPEN": {
      return { ...state, statsOpen: action.open };
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
  }).catch(() => {});
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
  const [baseLayers, setBaseLayers] = useState(layers);
  const [optimisticLayers, updateOptimisticLayers] = useOptimistic(
    baseLayers,
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

  // Sync base state when layers prop changes (e.g., on refetch)
  useEffect(() => {
    setBaseLayers(layers);
  }, [layers]);

  // Stable ref so callbacks that iterate all layers don't include optimisticLayers
  // in their dep array (which would recreate them on every layer change,
  // defeating memo() on LayerListItem and LayerManagementSection).
  const optimisticLayersRef = useRef(optimisticLayers);
  optimisticLayersRef.current = optimisticLayers;

  const [_isPending, startTransition] = useTransition();

  const [ui, dispatchUI] = useReducer(drawingToolsUIReducer, undefined, () => {
    let layersOpen = !!areaId;
    let regionsOpen = false;
    let statsOpen = false;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("drawing-tools-ui");
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as {
            layersOpen?: boolean;
            regionsOpen?: boolean;
            statsOpen?: boolean;
          };
          layersOpen = parsed.layersOpen ?? layersOpen;
          regionsOpen = parsed.regionsOpen ?? false;
          statsOpen = parsed.statsOpen ?? false;
        } catch {
          /* ignore */
        }
      }
    }
    return {
      layersOpen,
      regionsOpen,
      statsOpen,
      showVersionHistory: false,
      showCreateVersion: false,
      showLayerMerge: false,
      showKeyboardHelp: false,
      isFilling: false,
    };
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
      // Update base state to persist optimistic change
      setBaseLayers((prev) => [
        ...prev,
        { ...result.data, id: Date.now() } as Layer,
      ]);
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
      // Update base state to persist optimistic change
      setBaseLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, ...data } : l))
      );
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
      // Update base state to persist optimistic change
      setBaseLayers((prev) => prev.filter((l) => l.id !== layerId));
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
    const layers = optimisticLayersRef.current;
    if (!layers.length) {
      toast.warning("Keine Ebenen zum Exportieren vorhanden");
      return;
    }
    const layersWithCodes = layers
      .filter((layer) => layer.postalCodes && layer.postalCodes.length > 0)
      .map((layer) => ({
        layerName: layer.name,
        postalCodes: layer.postalCodes!.map((pc) => pc.postalCode),
        color: layer.color,
      }));
    if (!layersWithCodes.length) {
      toast.warning("Keine Ebenen mit Postleitzahlen zum Exportieren");
      return;
    }
    await exportLayersXLSX(layersWithCodes, areaName, country ?? "DE");
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
    await exportLayersPDF(layersWithCodes, areaName, country ?? "DE");
  };

  const handleExportGeoJSON = async () => {
    if (!areaId) {
      toast.warning("Kein Gebiet ausgewählt");
      return;
    }
    if (!optimisticLayersRef.current.length) {
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

  const handleExportZip = useCallback(async () => {
    const layers = optimisticLayersRef.current;
    if (!layers.length) {
      toast.warning("Keine Ebenen zum Exportieren vorhanden");
      return;
    }
    const layersWithCodes = layers.filter(
      (l) => l.postalCodes && l.postalCodes.length > 0
    );
    if (!layersWithCodes.length) {
      toast.warning("Keine Ebenen mit Postleitzahlen");
      return;
    }
    const { zipSync, strToU8 } = await import("fflate");
    const files: Record<string, Uint8Array> = {};
    for (const layer of layersWithCodes) {
      const safeName = (layer.name ?? `layer-${layer.id}`)
        .replace(/[^\w\-. ]/g, "_")
        .trim();
      const csvContent = layer
        .postalCodes!.map((pc) => pc.postalCode)
        .join("\n");
      files[`${safeName}.csv`] = strToU8(csvContent);
    }
    const zipped = zipSync(files);
    const blob = new Blob([zipped.buffer as ArrayBuffer], {
      type: "application/zip",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${areaName ?? `gebiet-${areaId}`}-ebenen.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${layersWithCodes.length} Ebenen als ZIP exportiert`);
  }, [areaName, areaId]);

  const handleCreateLayer = useCallback(async () => {
    if (!form.newLayerName.trim()) {
      return;
    }
    dispatchForm({ type: "START_CREATING" });
    startTransition(async () => {
      const existingColors = optimisticLayersRef.current.map((l) => l.color);
      const nextColor = generateNextColor(existingColors);
      const createdLayerName = form.newLayerName;
      updateOptimisticLayers({
        type: "create",
        layer: {
          name: createdLayerName,
          color: nextColor,
          opacity: 70,
          isVisible: "true",
          orderIndex: optimisticLayersRef.current.length,
          areaId: areaId!,
          postalCodes: [],
        },
      });
      dispatchForm({ type: "FINISH_CREATING" });
      await executeAction(
        createLayer({
          name: createdLayerName,
          color: nextColor,
          orderIndex: optimisticLayersRef.current.length,
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
  }, [
    form.newLayerName,
    areaId,
    dispatchForm,
    startTransition,
    updateOptimisticLayers,
    onLayerSelect,
  ]);

  const handleColorChange = useCallback(
    async (layerId: number, color: string) => {
      startTransition(async () => {
        updateOptimisticLayers({
          type: "update",
          id: layerId,
          layer: { color },
        });
        try {
          await updateLayer(layerId, { color });
        } catch {
          toast.error("Fehler beim Ändern der Farbe - Bitte erneut versuchen");
        }
      });
    },
    [startTransition, updateOptimisticLayers]
  );

  const handleOpacityChange = useCallback(
    (layerId: number, opacity: number) => {
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
    },
    [startTransition, updateOptimisticLayers]
  );

  const handleToggleVisibility = useCallback(
    (layerId: number, visible: boolean) => {
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
    },
    [startTransition, updateOptimisticLayers, areaId, onLayerUpdate]
  );

  const handleSoloLayer = useCallback(
    (soloId: number) => {
      startTransition(async () => {
        const layers = optimisticLayersRef.current;
        const updates: { layerId: number; isVisible: boolean }[] = [];
        for (const layer of layers) {
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
    },
    [startTransition, updateOptimisticLayers, areaId, onLayerUpdate]
  );

  const handleShowAllLayers = useCallback(() => {
    startTransition(async () => {
      const layers = optimisticLayersRef.current;
      const updates: { layerId: number; isVisible: boolean }[] = [];
      for (const layer of layers) {
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
  }, [startTransition, updateOptimisticLayers, areaId, onLayerUpdate]);

  const handleDeleteLayer = useCallback(
    (layerId: number) => {
      dispatchForm({ type: "OPEN_DELETE", layerId });
    },
    [dispatchForm]
  );

  const confirmDeleteLayer = useCallback(async () => {
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
  }, [
    form.layerToDelete,
    startTransition,
    updateOptimisticLayers,
    dispatchForm,
  ]);

  const handleRenameLayer = useCallback(
    async (layerId: number, newName: string) => {
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
    },
    [startTransition, updateOptimisticLayers, dispatchForm]
  );

  const handleFillHoles = () => {
    const activeLayer = optimisticLayersRef.current.find(
      (l) => l.id === activeLayerId
    );
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

  const handleReassignColors = useCallback(
    (theme?: string) => {
      startTransition(async () => {
        const colorMap = reassignAllColors(optimisticLayersRef.current, theme);
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
    },
    [startTransition, updateOptimisticLayers, onLayerUpdate]
  );

  const handleReorderLayers = useCallback(
    (oldIndex: number, newIndex: number) => {
      startTransition(async () => {
        const reordered = arrayMove(
          optimisticLayersRef.current,
          oldIndex,
          newIndex
        );
        const withNewIndices = reordered.map((l, i) => ({
          ...l,
          orderIndex: i,
        }));
        updateOptimisticLayers({ type: "reorder", layers: withNewIndices });
        const changedLayers = withNewIndices.filter(
          (l, i) => optimisticLayersRef.current[i]?.id !== l.id
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
    },
    [startTransition, updateOptimisticLayers, onLayerUpdate]
  );

  const handleSortByCount = useCallback(() => {
    startTransition(async () => {
      const sorted = [...optimisticLayersRef.current].sort(
        (a, b) => (b.postalCodes?.length ?? 0) - (a.postalCodes?.length ?? 0)
      );
      const withNewIndices = sorted.map((l, i) => ({ ...l, orderIndex: i }));
      updateOptimisticLayers({ type: "reorder", layers: withNewIndices });
      try {
        await Promise.all(
          withNewIndices.map((l) =>
            updateLayer(l.id, { orderIndex: l.orderIndex })
          )
        );
        onLayerUpdate?.();
        toast.success("Gebiete nach PLZ-Anzahl sortiert");
      } catch {
        toast.error("Fehler beim Sortieren");
      }
    });
  }, [startTransition, updateOptimisticLayers, onLayerUpdate]);

  const handleRemovePostalCodeFromLayer = useStableCallback(
    (layerId: number, postalCode: string) => {
      if (!removePostalCodesFromLayer) return;
      startTransition(async () => {
        const layer = optimisticLayers.find((l) => l.id === layerId);
        const updated =
          layer?.postalCodes?.filter((pc) => pc.postalCode !== postalCode) ??
          [];
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
    }
  );

  const handleClearLayerPLZ = useStableCallback((layerId: number) => {
    if (!removePostalCodesFromLayer) return;
    const layer = optimisticLayers.find((l) => l.id === layerId);
    const codes = layer?.postalCodes?.map((pc) => pc.postalCode) ?? [];
    if (codes.length === 0) return;
    startTransition(async () => {
      updateOptimisticLayers({
        type: "update",
        id: layerId,
        layer: { postalCodes: [] },
      });
      try {
        await removePostalCodesFromLayer(layerId, codes);
        onLayerUpdate?.();
        toast.success(`${codes.length} PLZ entfernt`);
      } catch {
        toast.error("Fehler beim Leeren des Layers");
      }
    });
  });

  const handleMovePlz = useStableCallback(
    (fromLayerId: number, toLayerId: number, postalCode: string) => {
      if (!addPostalCodesToLayer || !removePostalCodesFromLayer) return;
      startTransition(async () => {
        // Optimistically: remove from source, add to target
        const fromLayer = optimisticLayers.find((l) => l.id === fromLayerId);
        const toLayer = optimisticLayers.find((l) => l.id === toLayerId);
        if (!fromLayer || !toLayer) return;
        updateOptimisticLayers({
          type: "update",
          id: fromLayerId,
          layer: {
            postalCodes:
              fromLayer.postalCodes?.filter(
                (pc) => pc.postalCode !== postalCode
              ) ?? [],
          },
        });
        updateOptimisticLayers({
          type: "update",
          id: toLayerId,
          layer: {
            postalCodes: [...(toLayer.postalCodes ?? []), { postalCode }],
          },
        });
        try {
          await addPostalCodesToLayer(toLayerId, [postalCode]);
          await removePostalCodesFromLayer(fromLayerId, [postalCode]);
          onLayerUpdate?.();
          toast.success(`${postalCode} → ${toLayer.name}`);
        } catch {
          toast.error("Fehler beim Verschieben der PLZ");
        }
      });
    }
  );

  const handleNotesChange = useCallback(
    (layerId: number, notes: string) => {
      startTransition(async () => {
        updateOptimisticLayers({
          type: "update",
          id: layerId,
          layer: { notes },
        });
        try {
          await updateLayer(layerId, { notes: notes || null });
        } catch {
          toast.error("Fehler beim Speichern der Notiz");
        }
      });
    },
    [startTransition, updateOptimisticLayers]
  );

  const handleSetLayerGroup = useCallback(
    (layerId: number, groupName: string | null) => {
      startTransition(async () => {
        updateOptimisticLayers({
          type: "update",
          id: layerId,
          layer: { groupName: groupName ?? undefined },
        });
        try {
          await updateLayer(layerId, { groupName: groupName || null });
        } catch {
          toast.error("Fehler beim Speichern der Gruppe");
        }
      });
    },
    [startTransition, updateOptimisticLayers]
  );

  const handleBulkMovePlz = useStableCallback(
    (fromLayerId: number, toLayerId: number, codes: string[]) => {
      if (
        !addPostalCodesToLayer ||
        !removePostalCodesFromLayer ||
        codes.length === 0
      )
        return;
      startTransition(async () => {
        const fromLayer = optimisticLayers.find((l) => l.id === fromLayerId);
        const toLayer = optimisticLayers.find((l) => l.id === toLayerId);
        if (!fromLayer || !toLayer) return;
        const codeSet = new Set(codes);
        updateOptimisticLayers({
          type: "update",
          id: fromLayerId,
          layer: {
            postalCodes:
              fromLayer.postalCodes?.filter(
                (pc) => !codeSet.has(pc.postalCode)
              ) ?? [],
          },
        });
        const existingTarget = new Set(
          toLayer.postalCodes?.map((pc) => pc.postalCode) ?? []
        );
        const newForTarget = codes.filter((c) => !existingTarget.has(c));
        updateOptimisticLayers({
          type: "update",
          id: toLayerId,
          layer: {
            postalCodes: [
              ...(toLayer.postalCodes ?? []),
              ...newForTarget.map((c) => ({ postalCode: c })),
            ],
          },
        });
        try {
          await addPostalCodesToLayer(toLayerId, codes);
          await removePostalCodesFromLayer(fromLayerId, codes);
          onLayerUpdate?.();
          toast.success(`${codes.length} PLZ → ${toLayer.name}`);
        } catch {
          toast.error("Fehler beim Verschieben der PLZ");
        }
      });
    }
  );

  const handleBulkRemovePlz = useStableCallback(
    (layerId: number, codes: string[]) => {
      if (!removePostalCodesFromLayer || codes.length === 0) return;
      startTransition(async () => {
        const layer = optimisticLayers.find((l) => l.id === layerId);
        if (!layer) return;
        const codeSet = new Set(codes);
        updateOptimisticLayers({
          type: "update",
          id: layerId,
          layer: {
            postalCodes:
              layer.postalCodes?.filter((pc) => !codeSet.has(pc.postalCode)) ??
              [],
          },
        });
        try {
          await removePostalCodesFromLayer(layerId, codes);
          onLayerUpdate?.();
          toast.success(`${codes.length} PLZ entfernt`);
        } catch {
          toast.error("Fehler beim Entfernen der PLZ");
        }
      });
    }
  );

  const handleBulkDelete = useCallback(
    (layerIds: number[]) => {
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
    },
    [startTransition, updateOptimisticLayers]
  );

  const handleBulkVisibility = useCallback(
    (layerIds: number[], visible: boolean) => {
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
    },
    [startTransition, updateOptimisticLayers, areaId]
  );

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
    handleSortByCount,
    handleRemovePostalCodeFromLayer,
    handleMovePlz,
    handleNotesChange,
    handleSetLayerGroup,
    handleClearLayerPLZ,
    handleExportGeoJSON,
    handleExportData,
    handleExportZip,
    handleBulkDelete,
    handleBulkVisibility,
    handleBulkMovePlz,
    handleBulkRemovePlz,
  };
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
      dispatchUI(
        open ? { type: "OPEN_KEYBOARD_HELP" } : { type: "CLOSE_KEYBOARD_HELP" }
      ),
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tastaturkürzel</DialogTitle>
            <DialogDescription>
              Alle verfügbaren Shortcuts in der Kartenansicht
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto pr-1">
            {[
              {
                group: "Navigation & Ansicht",
                items: [
                  { keys: ["G"], desc: "Alle Ebenen anzeigen (Fit all)" },
                  { keys: ["F"], desc: "Karte auf aktive Ebene zentrieren" },
                  { keys: ["H"], desc: "Seitenleiste ein-/ausblenden" },
                  { keys: ["M"], desc: "Kartenstil wechseln" },
                  { keys: ["+"], desc: "Zoom in" },
                  { keys: ["-"], desc: "Zoom out" },
                  {
                    keys: ["Alt", "⇧", "↑ / ↓"],
                    desc: "Gebiet wechseln (Sidebar)",
                  },
                  { keys: ["Ctrl", "K"], desc: "Suche / Befehlspalette" },
                  { keys: ["Ctrl", "B"], desc: "Kartenlesezeichen" },
                  { keys: ["?"], desc: "Shortcuts anzeigen" },
                ],
              },
              {
                group: "Ebenen",
                items: [
                  { keys: ["Alt", "↑ / ↓"], desc: "Ebene wechseln" },
                  { keys: ["S"], desc: "Aktive Ebene solo / alle einblenden" },
                  { keys: ["N"], desc: "Neue Ebene anlegen" },
                  { keys: ["D"], desc: "Aktive Ebene duplizieren" },
                  { keys: ["E"], desc: "Sichtbarkeit umschalten" },
                  { keys: ["F2"], desc: "Aktive Ebene umbenennen" },
                  { keys: ["Del"], desc: "Aktive Ebene löschen" },
                ],
              },
              {
                group: "Zeichnen",
                items: [
                  { keys: ["Z"], desc: "Cursor-Modus" },
                  { keys: ["L"], desc: "Lasso-Modus" },
                  { keys: ["C"], desc: "Kursor-Modus (Kreis)" },
                  { keys: ["R"], desc: "Rechteck zeichnen" },
                  { keys: ["Enter"], desc: "Polygon abschließen" },
                  { keys: ["Backspace"], desc: "Letzten Punkt löschen" },
                  { keys: ["Esc"], desc: "Zeichenmodus beenden" },
                ],
              },
              {
                group: "PLZ-Aktionen",
                items: [
                  {
                    keys: ["Ctrl", "C"],
                    desc: "PLZ der aktiven Ebene kopieren",
                  },
                  {
                    keys: ["Ctrl", "V"],
                    desc: "PLZ aus Zwischenablage einfügen",
                  },
                  {
                    keys: ["Ctrl", "Shift", "V"],
                    desc: "PLZ-Bereich einfügen (z.B. 80331–80339)",
                  },
                  {
                    keys: ["Ctrl", "Shift", "P"],
                    desc: "PLZ-Präfix hinzufügen (z.B. 80 → alle 80xxx)",
                  },
                  {
                    keys: ["Ctrl", "A"],
                    desc: "Alle nicht zugewiesenen PLZ zum aktiven Layer hinzufügen",
                  },
                ],
              },
              {
                group: "Bearbeitung",
                items: [
                  { keys: ["Ctrl", "Z"], desc: "Rückgängig" },
                  { keys: ["Ctrl", "Y"], desc: "Wiederholen" },
                ],
              },
            ].map(({ group, items }) => (
              <div key={group}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  {group}
                </p>
                <div className="space-y-1">
                  {items.map(({ keys, desc }) => (
                    <div
                      key={desc}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-muted-foreground">{desc}</span>
                      <span className="flex gap-1 shrink-0">
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
  areaDescription,
  areaTags: initialAreaTags = EMPTY_ARRAY,
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
  undoRedoStatus,
  onPreviewPostalCode,
  onZoomToLayer,
  onHighlightCodes,
}: DrawingToolsProps) {
  const { isLocked: isLayerLocked } = useLockedLayers(areaId ?? 0);

  const [copyLayerDialog, setCopyLayerDialog] = useState<{
    open: boolean;
    layerId: number | null;
    layerName: string;
  }>({ open: false, layerId: null, layerName: "" });

  const [mergeLayersDialog, setMergeLayersDialog] = useState<{
    open: boolean;
    layerId: number | null;
    layerName: string;
  }>({ open: false, layerId: null, layerName: "" });

  // Area description inline editing
  const [descDraft, setDescDraft] = useState(areaDescription ?? "");
  const [descEditing, setDescEditing] = useState(false);
  // Sync draft when areaDescription changes (e.g., after server revalidation)
  const prevAreaDescription = useRef(areaDescription);
  if (prevAreaDescription.current !== areaDescription) {
    prevAreaDescription.current = areaDescription;
    if (!descEditing) setDescDraft(areaDescription ?? "");
  }

  const handleDescriptionSave = useCallback(async () => {
    setDescEditing(false);
    if (!areaId) return;
    const trimmed = descDraft.trim();
    if (trimmed === (areaDescription ?? "")) return;
    await updateAreaAction(areaId, { description: trimmed || undefined });
    onLayerUpdate?.();
  }, [areaId, descDraft, areaDescription, onLayerUpdate]);

  // Intercept addPostalCodesToLayer to block writes on locked layers
  const guardedAddPostalCodesToLayer = useStableCallback(
    async (layerId: number, codes: string[]) => {
      if (!addPostalCodesToLayer) return;
      if (isLayerLocked(layerId)) {
        toast.warning("Ebene ist gesperrt — PLZ hinzufügen nicht möglich");
        return;
      }
      await addPostalCodesToLayer(layerId, codes);
    }
  );
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
    handleSortByCount,
    handleRemovePostalCodeFromLayer,
    handleMovePlz,
    handleNotesChange,
    handleSetLayerGroup,
    handleClearLayerPLZ,
    handleExportGeoJSON,
    handleExportData,
    handleExportZip,
    handleBulkDelete,
    handleBulkVisibility,
    handleBulkMovePlz,
    handleBulkRemovePlz,
  } = useDrawingToolsActions({
    areaId,
    areaName,
    activeLayerId,
    onLayerSelect,
    layers,
    onLayerUpdate,
    addPostalCodesToLayer: guardedAddPostalCodesToLayer,
    removePostalCodesFromLayer,
    pendingPostalCodes,
    onAddPending,
    onRemovePending,
    granularity,
    country,
    postalCodesData,
  });

  const handleSetRegionsOpen = useCallback(
    (open: boolean) => {
      dispatchUI({ type: "SET_REGIONS_OPEN", open });
      try {
        const saved = localStorage.getItem("drawing-tools-ui");
        const prev = saved ? JSON.parse(saved) : {};
        localStorage.setItem(
          "drawing-tools-ui",
          JSON.stringify({ ...prev, regionsOpen: open })
        );
      } catch {
        /* ignore */
      }
    },
    [dispatchUI]
  );

  const handleSetStatsOpen = useCallback(
    (open: boolean) => {
      dispatchUI({ type: "SET_STATS_OPEN", open });
      try {
        const saved = localStorage.getItem("drawing-tools-ui");
        const prev = saved ? JSON.parse(saved) : {};
        localStorage.setItem(
          "drawing-tools-ui",
          JSON.stringify({ ...prev, statsOpen: open })
        );
      } catch {
        /* ignore */
      }
    },
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
      }).catch(() => {});
    },
    [areaId]
  );

  const [, startSplitTransition] = useTransition();
  const handleSplitLayer = useCallback(
    (layerId: number, splitCount: number) => {
      if (!areaId) return;
      startSplitTransition(async () => {
        const toastId = toast.loading(`Teile Layer in ${splitCount} Teile...`);
        const res = await splitLayerAction(areaId, layerId, splitCount);
        if (res.success) {
          toast.success(
            `Layer in ${splitCount} Teile aufgeteilt (${res.data?.createdLayerIds.length} neue Layer)`,
            { id: toastId }
          );
          onLayerUpdate?.();
        } else {
          toast.error(res.error ?? "Fehler beim Aufteilen", { id: toastId });
        }
      });
    },
    [areaId, onLayerUpdate]
  );

  const [isCopyingLayer, startCopyLayerTransition] = useTransition();
  const [isUndoRedoPending, startUndoRedoTransition] = useTransition();

  const handleUndo = useCallback(() => {
    if (!areaId || !undoRedoStatus?.canUndo || isUndoRedoPending) return;
    startUndoRedoTransition(async () => {
      await undoChangeAction(areaId);
    });
  }, [areaId, undoRedoStatus?.canUndo, isUndoRedoPending]);

  const handleRedo = useCallback(() => {
    if (!areaId || !undoRedoStatus?.canRedo || isUndoRedoPending) return;
    startUndoRedoTransition(async () => {
      await redoChangeAction(areaId);
    });
  }, [areaId, undoRedoStatus?.canRedo, isUndoRedoPending]);

  const handleOpenCopyToArea = useCallback(
    (layerId: number, layerName: string) => {
      setCopyLayerDialog({ open: true, layerId, layerName });
    },
    []
  );

  const handleOpenMergeLayers = useCallback(
    (layerId: number, layerName: string) => {
      setMergeLayersDialog({ open: true, layerId, layerName });
    },
    []
  );

  const handleExportLayerCSV = useCallback(
    (layerId: number, layerName: string, codes: string[]) => {
      void downloadLayerCSV(layerName, codes, country ?? "DE");
    },
    [country]
  );

  const handleConfirmCopyToArea = useCallback(
    (targetAreaId: number, newName: string) => {
      const layerId = copyLayerDialog.layerId;
      if (!layerId) return;
      setCopyLayerDialog((prev) => ({ ...prev, open: false }));
      startCopyLayerTransition(async () => {
        const res = await copyLayerToAreaAction(layerId, targetAreaId, newName);
        if (res.success) {
          toast.success("Ebene erfolgreich kopiert");
        } else {
          toast.error(res.error ?? "Kopieren fehlgeschlagen");
        }
      });
    },
    [copyLayerDialog.layerId]
  );

  const allCodesSet = useMemo<Set<string>>(() => {
    if (!postalCodesData?.features) return new Set();
    const s = new Set<string>();
    for (const f of postalCodesData.features) {
      const code =
        f.properties?.code ?? f.properties?.postal_code ?? f.properties?.PLZ;
      if (typeof code === "string") s.add(code);
    }
    return s;
  }, [postalCodesData]);

  // Active-country total: only count codes from countries that appear in at least one layer.
  // Used for per-layer coverage percentages so a DE-only area shows % of ~8k DE codes, not ~13k DACH.
  const activeTotalCodes = useMemo(() => {
    if (!postalCodesData?.features || postalCodesData.features.length === 0)
      return postalCodesData?.features.length ?? 0;
    const countryTotals = new Map<string, number>();
    const codeCountryMap = new Map<string, string>();
    for (const f of postalCodesData.features) {
      const code = f.properties?.code as string | undefined;
      const c = f.properties?.country as string | undefined;
      if (c) countryTotals.set(c, (countryTotals.get(c) ?? 0) + 1);
      if (code && c && !codeCountryMap.has(code)) codeCountryMap.set(code, c);
    }
    const countriesInUse = new Set<string>();
    for (const layer of optimisticLayers) {
      for (const pc of layer.postalCodes ?? []) {
        // Use stored-format prefix for unambiguous country identification
        const composite = storedCodeToCompositeKey(pc.postalCode);
        const c = composite
          ? composite.split(":")[0]
          : codeCountryMap.get(pc.postalCode);
        if (c) countriesInUse.add(c);
      }
    }
    if (countriesInUse.size === 0) return 0;
    return [...countriesInUse].reduce(
      (sum, c) => sum + (countryTotals.get(c) ?? 0),
      0
    );
  }, [postalCodesData, optimisticLayers]);

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const activeLayerIdRef = useRef(activeLayerId);
  activeLayerIdRef.current = activeLayerId;
  const onLayerSelectRef = useRef(onLayerSelect);
  onLayerSelectRef.current = onLayerSelect;
  const guardedAddRef = useRef(guardedAddPostalCodesToLayer);
  guardedAddRef.current = guardedAddPostalCodesToLayer;
  const dispatchUIRef = useRef(dispatchUI);
  dispatchUIRef.current = dispatchUI;
  const onZoomToLayerRef = useRef(onZoomToLayer);
  onZoomToLayerRef.current = onZoomToLayer;
  const plzFindInputRef = useRef<HTMLInputElement | null>(null);
  const newLayerInputRef = useRef<HTMLInputElement | null>(null);
  const showNewLayerInputRef = useRef<((show: boolean) => void) | null>(null);
  const handleDuplicateLayerRef = useRef(handleDuplicateLayer);
  handleDuplicateLayerRef.current = handleDuplicateLayer;
  const handleToggleVisibilityRef = useRef(handleToggleVisibility);
  handleToggleVisibilityRef.current = handleToggleVisibility;
  const handleDeleteLayerRef = useRef(handleDeleteLayer);
  handleDeleteLayerRef.current = handleDeleteLayer;
  const handleSoloLayerRef = useRef(handleSoloLayer);
  handleSoloLayerRef.current = handleSoloLayer;
  const handleShowAllLayersRef = useRef(handleShowAllLayers);
  handleShowAllLayersRef.current = handleShowAllLayers;
  const countryRef = useRef(country);
  countryRef.current = country;
  const areaIdRef = useRef(areaId);
  areaIdRef.current = areaId;
  const allCodesSetRef = useRef(allCodesSet);
  allCodesSetRef.current = allCodesSet;
  const getAllCodesSet = useCallback(() => allCodesSetRef.current, []);
  const dispatchFormRef = useRef(dispatchForm);
  dispatchFormRef.current = dispatchForm;

  const handleOpenKeyboardHelp = useCallback(
    () => dispatchUI({ type: "OPEN_KEYBOARD_HELP" }),
    [dispatchUI]
  );

  const handleMergeSuccess = useCallback(
    () => onLayerUpdate?.(),
    [onLayerUpdate]
  );

  const handleOpenConflicts = useCallback(() => {
    onOpenConflicts?.();
  }, [onOpenConflicts]);

  const mergeDialogOtherLayers = useMemo(
    () =>
      (layers ?? [])
        .filter((l) => l.id !== mergeLayersDialog.layerId)
        .map((l) => ({ id: l.id, name: l.name })),
    [layers, mergeLayersDialog.layerId]
  );

  const handleCopyDialogOpenChange = useCallback(
    (open: boolean) => setCopyLayerDialog((prev) => ({ ...prev, open })),
    []
  );

  const handleMergeDialogOpenChange = useCallback(
    (open: boolean) => setMergeLayersDialog((prev) => ({ ...prev, open })),
    []
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // / key: focus PLZ quick-find
      if (
        e.key === "/" &&
        !isInInput &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        dispatchUIRef.current({ type: "SET_LAYERS_OPEN", open: true });
        // Defer focus until after collapsible opens
        setTimeout(() => {
          plzFindInputRef.current?.focus();
          plzFindInputRef.current?.select();
        }, 50);
        return;
      }

      // F key: zoom to active layer
      if (
        e.key === "f" &&
        !isInInput &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        const id = activeLayerIdRef.current;
        if (id) onZoomToLayerRef.current?.(id);
        return;
      }

      // N key: focus new layer input
      if (
        e.key === "n" &&
        !isInInput &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        dispatchUIRef.current({ type: "SET_LAYERS_OPEN", open: true });
        showNewLayerInputRef.current?.(true);
        setTimeout(() => {
          newLayerInputRef.current?.focus();
          newLayerInputRef.current?.select();
        }, 50);
        return;
      }

      // D key: duplicate active layer
      if (
        e.key === "d" &&
        !isInInput &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        const id = activeLayerIdRef.current;
        if (id) handleDuplicateLayerRef.current(id);
        return;
      }

      // E key: toggle visibility of active layer
      if (
        e.key === "e" &&
        !isInInput &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        const id = activeLayerIdRef.current;
        const activeLayer = layersRef.current.find((l) => l.id === id);
        if (activeLayer) {
          handleToggleVisibilityRef.current(
            activeLayer.id,
            activeLayer.isVisible !== "true"
          );
        }
        return;
      }

      // Delete / Backspace: delete active layer (only when not in input)
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !isInInput &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        const id = activeLayerIdRef.current;
        if (id) handleDeleteLayerRef.current(id);
        return;
      }

      // F2: rename active layer
      if (e.key === "F2" && !isInInput) {
        const id = activeLayerIdRef.current;
        const activeLayer = layersRef.current.find((l) => l.id === id);
        if (activeLayer) {
          e.preventDefault();
          dispatchFormRef.current({
            type: "START_EDIT",
            layerId: activeLayer.id,
            name: activeLayer.name,
          });
        }
        return;
      }

      // Ctrl+C / Cmd+C: copy active layer PLZ to clipboard (when not in input)
      if (
        e.key === "c" &&
        !isInInput &&
        (e.ctrlKey || e.metaKey) &&
        !e.altKey
      ) {
        const id = activeLayerIdRef.current;
        const activeLayer = layersRef.current.find((l) => l.id === id);
        if (!activeLayer?.postalCodes?.length) return;
        e.preventDefault();
        const codes = activeLayer.postalCodes.map((pc) => pc.postalCode);
        copyPostalCodesCSV(codes, countryRef.current ?? "DE");
        return;
      }

      // ? key: open keyboard help
      if (e.key === "?" && !isInInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatchUIRef.current({ type: "OPEN_KEYBOARD_HELP" });
        return;
      }

      // S key: solo active layer (or show all if already soloed)
      if (
        e.key === "s" &&
        !isInInput &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        const id = activeLayerIdRef.current;
        if (id) {
          e.preventDefault();
          const currentLayers = layersRef.current;
          const allOthersHidden = currentLayers
            .filter((l) => l.id !== id)
            .every((l) => l.isVisible === "false");
          if (allOthersHidden) {
            handleShowAllLayersRef.current();
          } else {
            handleSoloLayerRef.current(id);
          }
        }
        return;
      }

      // Ctrl+A: Add all unassigned visible PLZ to active layer
      if (
        e.key === "a" &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !isInInput
      ) {
        e.preventDefault();
        const layerId = activeLayerIdRef.current;
        const addFn = guardedAddRef.current;
        const allCodes = allCodesSetRef.current;
        const currentLayers = layersRef.current;
        if (!layerId || !addFn || !allCodes || allCodes.size === 0) return;
        // Collect all assigned codes across all layers
        const assignedCodes = new Set(
          currentLayers.flatMap(
            (l) => l.postalCodes?.map((pc) => pc.postalCode) ?? []
          )
        );
        const unassigned = [...allCodes].filter((c) => !assignedCodes.has(c));
        if (unassigned.length === 0) {
          toast.info("Alle sichtbaren PLZ sind bereits zugewiesen");
          return;
        }
        addFn(layerId, unassigned).then(() => {
          toast.success(
            `${unassigned.length} nicht zugewiesene PLZ zum aktiven Layer hinzugefügt`
          );
        });
        return;
      }

      // Ctrl+Shift+V: PLZ range insert (e.g. 80331-80339)
      if (
        e.key === "V" &&
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !isInInput
      ) {
        e.preventDefault();
        const layerId = activeLayerIdRef.current;
        const addFn = guardedAddRef.current;
        if (!layerId || !addFn) return;
        const input = window.prompt(
          'PLZ-Bereich eingeben (z.B. "80331-80339" oder "80331, 80332, 80339")'
        );
        if (!input) return;
        // Parse range like 80331-80339 or 80331–80339
        const rangeMatch = /^(\d{4,5})\s*[-–]\s*(\d{4,5})$/.exec(input.trim());
        let codes: string[] = [];
        if (rangeMatch) {
          const from = parseInt(rangeMatch[1], 10);
          const to = parseInt(rangeMatch[2], 10);
          if (from <= to && to - from <= 500) {
            for (let i = from; i <= to; i++) {
              codes.push(String(i).padStart(rangeMatch[1].length, "0"));
            }
          }
        } else {
          codes = input
            .split(/[\s,;]+/)
            .map((s) => s.trim())
            .filter((s) => /^\d{4,5}$/.test(s));
        }
        if (codes.length === 0) {
          toast.error("Keine gültigen PLZ gefunden");
          return;
        }
        addFn(layerId, codes).then(() => {
          toast.success(`${codes.length} PLZ aus Bereich eingefügt`);
        });
        return;
      }

      // Ctrl+Shift+P: PLZ prefix add (e.g. "80" → all 80xxx)
      if (
        e.key === "P" &&
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !isInInput
      ) {
        e.preventDefault();
        const layerId = activeLayerIdRef.current;
        const currentAreaId = areaIdRef.current;
        if (!layerId || !currentAreaId) return;
        const input = window.prompt(
          'PLZ-Präfix eingeben (z.B. "80" → alle PLZ die mit 80 beginnen)'
        );
        if (!input) return;
        const prefix = input.trim();
        if (!/^\d{1,4}$/.test(prefix)) {
          toast.error("Ungültiger Präfix — bitte 1–4 Ziffern eingeben");
          return;
        }
        const toastId = toast.loading(`Füge PLZ mit Präfix "${prefix}" hinzu…`);
        addPostalCodesByPrefixAction(currentAreaId, layerId, prefix).then(
          (res) => {
            toast.dismiss(toastId);
            if (!res.success) {
              toast.error(res.error ?? "Fehler beim Hinzufügen");
            } else if ((res.data?.count ?? 0) === 0) {
              toast.warning(`Keine neuen PLZ für Präfix "${prefix}" gefunden`);
            } else {
              toast.success(
                `${res.data?.count} PLZ mit Präfix "${prefix}" eingefügt`
              );
            }
          }
        );
        return;
      }

      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      if (isInInput) return;
      const currentLayers = layersRef.current;
      if (!currentLayers.length) return;
      const currentIdx = currentLayers.findIndex(
        (l) => l.id === activeLayerIdRef.current
      );
      const nextIdx =
        e.key === "ArrowUp"
          ? Math.max(0, (currentIdx === -1 ? 0 : currentIdx) - 1)
          : Math.min(
              currentLayers.length - 1,
              (currentIdx === -1 ? 0 : currentIdx) + 1
            );
      if (nextIdx !== currentIdx) {
        e.preventDefault();
        onLayerSelectRef.current?.(currentLayers[nextIdx].id);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      // Only intercept paste outside text inputs
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      const addFn = guardedAddRef.current;
      const layerId = activeLayerIdRef.current;
      if (!addFn || !layerId) return;
      const text = e.clipboardData?.getData("text") ?? "";
      const codes = text
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d{4,5}$/.test(s));
      if (codes.length === 0) return;
      e.preventDefault();
      addFn(layerId, codes).then(() => {
        toast.success(`${codes.length} PLZ eingefügt`);
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
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
  const handleTriggerImportData = useCallback(() => {
    importDataFileRef.current?.click();
  }, []);

  return (
    <Card
      role="region"
      aria-label="Kartentools-Panel"
      className="gap-1.5 max-w-md min-w-80 flex flex-col max-h-full min-h-0 py-3"
    >
      <CardHeader className="pb-0 gap-0.5">
        <CardTitle className="text-base leading-tight">Kartentools</CardTitle>
        {areaName && (
          <div>
            <p className="text-xs font-medium text-foreground truncate">
              {areaName}
            </p>
            {descEditing ? (
              <textarea
                // biome-ignore lint/a11y/noAutofocus: intentional focus on inline edit
                autoFocus
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={handleDescriptionSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleDescriptionSave();
                  }
                  if (e.key === "Escape") {
                    setDescEditing(false);
                    setDescDraft(areaDescription ?? "");
                  }
                }}
                placeholder="Beschreibung hinzufügen…"
                rows={2}
                className="w-full text-xs text-muted-foreground bg-muted border border-input rounded px-1.5 py-0.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : descDraft ? (
              <button
                type="button"
                onClick={() => {
                  if (areaId && !isViewingVersion) setDescEditing(true);
                }}
                title={isViewingVersion ? undefined : "Beschreibung bearbeiten"}
                className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {descDraft}
              </button>
            ) : null}
            {areaId && !isViewingVersion && (
              <div className="mt-1">
                <AreaTagsManager
                  areaId={areaId}
                  initialTags={initialAreaTags}
                />
              </div>
            )}
          </div>
        )}
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
          {!isViewingVersion && areaId && undoRedoStatus && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={!undoRedoStatus.canUndo || isUndoRedoPending}
                      aria-label="Rückgängig"
                      className="p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  }
                >
                  <Undo2 className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Rückgängig (Strg+Z)</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={!undoRedoStatus.canRedo || isUndoRedoPending}
                      aria-label="Wiederholen"
                      className="p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  }
                >
                  <Redo2 className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Wiederholen (Strg+Umschalt+Z)</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
          {postalCodesData && !isViewingVersion && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    title="Export / Import"
                    aria-label="Export / Import"
                    className="p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary text-muted-foreground"
                  />
                }
              >
                <Download className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    Exportieren
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={handleExportExcel}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={handleExportPDF}
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={handleExportGeoJSON}
                  >
                    <FileJson className="h-3.5 w-3.5 text-muted-foreground" />
                    GeoJSON (mit Geometrien)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={handleExportData}
                  >
                    <FileJson className="h-3.5 w-3.5 text-muted-foreground" />
                    JSON (Backup)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={handleExportZip}
                  >
                    <FileArchive className="h-3.5 w-3.5 text-muted-foreground" />
                    ZIP (alle Ebenen als CSV)
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                    Importieren
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    className="text-xs gap-2"
                    onClick={handleTriggerImportData}
                  >
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    Gebiet aus JSON importieren
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onOpenConflicts && (
            <button
              type="button"
              onClick={handleOpenConflicts}
              title="Konflikte lösen"
              aria-label="Konflikte lösen"
              className="p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary text-muted-foreground"
            >
              <IconAlertTriangle className="h-4 w-4" />
            </button>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={handleOpenKeyboardHelp}
                  aria-label="Tastaturkürzel anzeigen"
                  className="p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary text-muted-foreground"
                />
              }
            >
              <HelpCircle className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Tastaturkürzel{" "}
                <kbd className="ml-1 px-1 py-0.5 text-[10px] font-mono bg-muted border rounded">
                  ?
                </kbd>
              </p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onToggleVisibility}
                  aria-label="Werkzeugleiste ausblenden"
                  className="ml-auto p-1 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              }
            >
              <X className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Ausblenden{" "}
                <kbd className="ml-1 px-1 py-0.5 text-[10px] font-mono bg-muted border rounded">
                  H
                </kbd>
              </p>
            </TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1 overflow-y-auto min-h-0 flex-1">
        {/* Granularity Management Section */}
        {granularity && onGranularityChange && (
          <>
            <div className="py-0.5">
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
            handleSplitLayer={handleSplitLayer}
            handleOpenCopyToArea={handleOpenCopyToArea}
            handleOpenMergeLayers={handleOpenMergeLayers}
            handleToggleVisibility={handleToggleVisibility}
            handleSoloLayer={handleSoloLayer}
            handleShowAllLayers={handleShowAllLayers}
            handleReassignColors={handleReassignColors}
            handleReorderLayers={handleReorderLayers}
            handleSortByCount={handleSortByCount}
            handleRemovePostalCodeFromLayer={handleRemovePostalCodeFromLayer}
            handleMovePlz={handleMovePlz}
            handleNotesChange={handleNotesChange}
            handleSetLayerGroup={handleSetLayerGroup}
            handleClearLayerPLZ={handleClearLayerPLZ}
            addPostalCodesToLayer={guardedAddPostalCodesToLayer}
            onOpenConflicts={onOpenConflicts}
            handleBulkDelete={handleBulkDelete}
            handleBulkVisibility={handleBulkVisibility}
            handleBulkMovePlz={handleBulkMovePlz}
            handleBulkRemovePlz={handleBulkRemovePlz}
            onPreviewPostalCode={onPreviewPostalCode}
            onZoomToLayer={onZoomToLayer}
            plzFindInputRef={plzFindInputRef}
            newLayerInputRef={newLayerInputRef}
            showNewLayerInputRef={showNewLayerInputRef}
            allCodesSet={allCodesSet}
            getAllCodesSet={getAllCodesSet}
            activeCodesTotal={activeTotalCodes}
            onLayerUpdate={onLayerUpdate}
            handleExportLayerCSV={handleExportLayerCSV}
          />
        )}

        {/* Regions Section — only shown when there are pending codes */}
        {pendingPostalCodes.length > 0 && (
          <PendingRegionsSection
            pendingPostalCodes={pendingPostalCodes}
            regionsOpen={ui.regionsOpen}
            onOpenChange={handleSetRegionsOpen}
            canAdd={!!(areaId && activeLayerId && addPostalCodesToLayer)}
            canRemove={
              !!(areaId && activeLayerId && removePostalCodesFromLayer)
            }
            onAddPending={handleAddPendingToLayer}
            onRemovePending={handleRemovePendingFromLayer}
          />
        )}

        {/* Actions Section — drawing-mode-only actions (clear/fill) */}
        <DrawingActionsSection
          currentMode={currentMode}
          postalCodesData={postalCodesData}
          activeLayerId={activeLayerId}
          areaId={areaId}
          isFilling={ui.isFilling}
          onFillHoles={handleFillHoles}
          onClearAll={handleClearAllWithToast}
        />

        {/* Hidden file input for JSON import — triggered via dropdown */}
        <input
          ref={importDataFileRef}
          type="file"
          accept=".json"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleImportDataFile}
        />

        {/* Stats Section — hidden when no codes are assigned */}
        {postalCodesData && activeTotalCodes > 0 && (
          <StatsSection
            layers={optimisticLayers}
            postalCodesData={postalCodesData}
            onLayerSelect={onLayerSelect}
            open={ui.statsOpen}
            onOpenChange={handleSetStatsOpen}
          />
        )}

        {/* Länder Section — per-country breakdown with remove-by-country action */}
        {postalCodesData && activeTotalCodes > 0 && (
          <LänderSection
            layers={optimisticLayers}
            postalCodesData={postalCodesData}
            areaId={areaId}
            onLayerUpdate={onLayerUpdate}
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

        {/* Copy Layer to Area Dialog */}
        <CopyLayerToAreaDialog
          open={copyLayerDialog.open}
          onOpenChange={handleCopyDialogOpenChange}
          sourceLayerName={copyLayerDialog.layerName ?? ""}
          currentAreaId={areaId ?? 0}
          onConfirm={handleConfirmCopyToArea}
          isPending={isCopyingLayer}
        />

        {/* Merge Layers Dialog */}
        <MergeLayersDialog
          open={mergeLayersDialog.open}
          onOpenChange={handleMergeDialogOpenChange}
          areaId={areaId ?? 0}
          sourceLayerId={mergeLayersDialog.layerId ?? 0}
          sourceLayerName={mergeLayersDialog.layerName ?? ""}
          otherLayers={mergeDialogOtherLayers}
          onSuccess={handleMergeSuccess}
        />
      </CardContent>
    </Card>
  );
}

export const DrawingTools = memo(function DrawingTools(
  props: DrawingToolsProps
) {
  return (
    <Suspense
      fallback={<Skeleton className="w-full h-full min-h-50 rounded-lg" />}
    >
      <DrawingToolsImpl {...props} />
    </Suspense>
  );
});