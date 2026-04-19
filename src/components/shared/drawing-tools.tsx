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
import type { InferSelectModel } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
  ArrowDownUp,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Folder,
  GripVertical,
  HelpCircle,
  MapPin,
  Palette,
  Scale,
  Search,
  Square,
  TriangleAlert,
  Trash2,
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
  balanceLayersAction,
  fixDuplicateCodeAction,
  fixDuplicateWithLayerAction,
  addPostalCodesByPrefixAction,
  splitLayerAction,
} from "@/app/actions/area-actions";
import {
  batchUpdateVisibilityAction,
  mergeLayersAction,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { useLayerFormState } from "@/lib/hooks/use-layer-form-state";
import { useLockedLayers } from "@/lib/hooks/use-locked-layers";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { TerraDrawMode } from "@/lib/hooks/use-terradraw";
import type {
  ChangeSummary,
  VersionSummary,
  areaLayers,
} from "@/lib/schema/schema";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";
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

interface StatsSectionProps {
  layers: Layer[];
  postalCodesData?: FeatureCollection<Polygon | MultiPolygon>;
  onLayerSelect?: (layerId: number) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function StatsSection({
  layers,
  postalCodesData,
  onLayerSelect,
  open = true,
  onOpenChange,
}: StatsSectionProps) {
  const totalFeatures = postalCodesData?.features.length ?? 0;
  const assignedSet = new Set(
    layers.flatMap((l) => l.postalCodes?.map((pc) => pc.postalCode) ?? [])
  );
  const assignedCount = assignedSet.size;
  const unassignedCount = Math.max(0, totalFeatures - assignedCount);
  const coverage =
    totalFeatures > 0 ? (assignedCount / totalFeatures) * 100 : 0;

  // Build sorted layer sizes for bar chart (include full data for CSV)
  const layerSizes = layers
    .map((l) => {
      const codes = l.postalCodes?.map((pc) => pc.postalCode) ?? [];
      const sorted = [...codes].sort();
      return {
        id: l.id,
        name: l.name ?? `Layer ${l.id}`,
        count: codes.length,
        color: l.color ?? "#6366f1",
        notes: l.notes ?? "",
        minCode: sorted[0] ?? "",
        maxCode: sorted.at(-1) ?? "",
      };
    })
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...layerSizes.map((l) => l.count), 1);

  return (
    <>
      <Separator />
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-0.5 text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">Statistik</span>
            {!open && (
              <span className="text-muted-foreground text-xs">
                {coverage.toFixed(0)}% Abdeckung · {assignedCount} PLZ
              </span>
            )}
          </div>
          <IconChevronDown
            className={`text-muted-foreground size-3.5 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 pb-1 pt-1">
            {/* Coverage donut ring */}
            <div className="flex items-center gap-3">
              <svg
                width="52"
                height="52"
                viewBox="0 0 52 52"
                className="shrink-0"
                aria-hidden
              >
                <circle
                  cx="26"
                  cy="26"
                  r="20"
                  fill="none"
                  strokeWidth="5"
                  className="stroke-muted"
                />
                <circle
                  cx="26"
                  cy="26"
                  r="20"
                  fill="none"
                  strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - Math.min(coverage, 100) / 100)}`}
                  strokeLinecap="round"
                  className="stroke-primary transition-[stroke-dashoffset] duration-500"
                  transform="rotate(-90 26 26)"
                />
                <text
                  x="26"
                  y="25"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9.5"
                  fontWeight="bold"
                  className="fill-foreground"
                >
                  {coverage.toFixed(0)}%
                </text>
                <text
                  x="26"
                  y="34"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="6.5"
                  className="fill-muted-foreground"
                >
                  Abdeckung
                </text>
              </svg>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Zugewiesen</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {assignedCount.toLocaleString("de-DE")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Ohne Gebiet</span>
                  <span
                    className={`tabular-nums font-medium ${unassignedCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
                  >
                    {unassignedCount.toLocaleString("de-DE")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Gesamt PLZ</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {totalFeatures.toLocaleString("de-DE")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Gebiete</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {layers.length}
                  </span>
                </div>
              </div>
            </div>
            {layerSizes.length > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold text-muted-foreground">
                    Layer-Verteilung
                  </div>
                  <button
                    type="button"
                    className="text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                    title="Statistik als CSV exportieren"
                    onClick={() => {
                      const total = layerSizes.reduce((s, l) => s + l.count, 0);
                      const header = "Layer;Farbe;PLZ;Anteil %;Von;Bis;Notizen";
                      const rows = layerSizes.map(
                        (l) =>
                          `${l.name};${l.color};${l.count};${total > 0 ? ((l.count / total) * 100).toFixed(1) : "0.0"};${l.minCode};${l.maxCode};"${(l.notes ?? "").replace(/"/g, '""')}"`
                      );
                      const csv = [header, ...rows].join("\n");
                      const blob = new Blob(["\uFEFF" + csv], {
                        type: "text/csv;charset=utf-8;",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "statistik.csv";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-2.5 w-2.5" />
                    CSV
                  </button>
                </div>
                {layerSizes.map((layer) => (
                  <div key={layer.id} className="flex items-center gap-1.5">
                    <div
                      className="w-24 shrink-0 truncate text-[10px] text-muted-foreground"
                      title={layer.name}
                    >
                      {layer.name}
                    </div>
                    <div className="relative flex-1 h-3 rounded-sm bg-muted overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-300"
                        style={{
                          width: `${(layer.count / maxCount) * 100}%`,
                          backgroundColor: layer.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <div className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {layer.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

function ConflictBanner({
  crossAreaDuplicates,
  crossAreaDuplicatesByArea,
}: {
  crossAreaDuplicates: {
    postalCode: string;
    otherAreaId: number;
    otherAreaName: string;
  }[];
  crossAreaDuplicatesByArea: Map<string, { areaId: number; codes: string[] }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const areaCount = crossAreaDuplicatesByArea.size;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400"
      >
        <TriangleAlert className="h-3 w-3 shrink-0" />
        <span className="flex-1 text-left">
          {crossAreaDuplicates.length.toLocaleString("de-DE")} PLZ in{" "}
          {areaCount} {areaCount === 1 ? "anderem Gebiet" : "anderen Gebieten"}
        </span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <ul className="mt-1 space-y-0.5 text-amber-600 dark:text-amber-500 max-h-32 overflow-y-auto">
          {[...crossAreaDuplicatesByArea.entries()].map(
            ([areaName, { areaId: otherAreaId, codes }]) => (
              <li key={areaName} className="flex items-baseline gap-1 min-w-0">
                <a
                  href={`/postal-codes/${otherAreaId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium truncate underline-offset-2 hover:underline shrink-0 max-w-[120px]"
                >
                  {areaName}
                </a>
                <span className="text-[10px]">
                  {codes.slice(0, 5).join(", ")}
                  {codes.length > 5 ? ` +${codes.length - 5}` : ""}
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

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

interface DrawingToolsUIState {
  layersOpen: boolean;
  regionsOpen: boolean;
  statsOpen: boolean;
  showVersionHistory: boolean;
  showCreateVersion: boolean;
  showLayerMerge: boolean;
  showKeyboardHelp: boolean;
  isFilling: boolean;
}

type DrawingToolsUIAction =
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
  allCodesSet?: Set<string>;
  onLayerUpdate?: () => void;
  onHighlightCodes?: (codes: Set<string> | null) => void;
  handleExportLayerCSV?: (
    layerId: number,
    layerName: string,
    codes: string[]
  ) => void;
}

const LayerManagementSection = memo(function LayerManagementSection({
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
  allCodesSet,
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

  const [isBalancing, setIsBalancing] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [, startBalanceTransition] = useTransition();
  const handleBalanceLayers = useCallback(() => {
    if (!areaId || optimisticLayersRef.current.length < 2) return;
    const layerIdsWithCodes = optimisticLayersRef.current
      .filter((l) => (l.postalCodes?.length ?? 0) > 0)
      .map((l) => l.id);
    if (layerIdsWithCodes.length < 2) {
      toast.error("Mindestens 2 Ebenen mit PLZ benötigt");
      return;
    }
    startBalanceTransition(async () => {
      setIsBalancing(true);
      try {
        const res = await balanceLayersAction(areaId, layerIdsWithCodes);
        if (!res.success) {
          toast.error(res.error ?? "Fehler beim Ausgleichen");
          return;
        }
        const totalMoved = (res.data ?? []).reduce(
          (s, m) => s + m.codes.length,
          0
        );
        if (totalMoved === 0) {
          toast.success("Ebenen sind bereits ausgeglichen");
        } else {
          toast.success(`${totalMoved} PLZ verschoben — Ebenen ausgeglichen`);
          onLayerUpdate?.();
        }
      } catch {
        toast.error("Fehler beim Ausgleichen");
      } finally {
        setIsBalancing(false);
      }
    });
  }, [areaId, onLayerUpdate, startBalanceTransition]);
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

  // Cross-area PLZ duplicate detection — fetched lazily when layers section is open
  const [crossAreaDuplicates, setCrossAreaDuplicates] = useState<
    { postalCode: string; otherAreaId: number; otherAreaName: string }[]
  >([]);
  const [crossAreaLoaded, setCrossAreaLoaded] = useState(false);
  useEffect(() => {
    if (!areaId || crossAreaLoaded) return;
    fetch(`/api/areas/${areaId}/duplicates`)
      .then((r) => r.json())
      .then((data) => {
        setCrossAreaDuplicates(Array.isArray(data) ? data : []);
        setCrossAreaLoaded(true);
      })
      .catch(() => setCrossAreaLoaded(true));
  }, [areaId, crossAreaLoaded]);

  // Group cross-area duplicates by other area name for compact display
  const crossAreaDuplicatesByArea = useMemo(() => {
    const map = new Map<string, { areaId: number; codes: string[] }>();
    for (const d of crossAreaDuplicates) {
      const existing = map.get(d.otherAreaName);
      if (existing) {
        existing.codes.push(d.postalCode);
      } else {
        map.set(d.otherAreaName, {
          areaId: d.otherAreaId,
          codes: [d.postalCode],
        });
      }
    }
    return map;
  }, [crossAreaDuplicates]);

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

  // PLZ cross-layer finder: when search looks like a 5-digit postal code
  const plzSearchResults = useMemo(() => {
    const q = layerSearch.trim();
    if (!/^\d{5}$/.test(q)) return null;
    return optimisticLayers
      .filter((l) => l.postalCodes?.some((pc) => pc.postalCode === q))
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
                  const raw =
                    p.postal_code ??
                    p.postcode ??
                    p.plz ??
                    p.PLZ ??
                    p.code ??
                    p.zip ??
                    "";
                  return String(raw).replace(/\D/g, "").trim();
                })
                .filter((c) => c.length >= 2 && c.length <= 5);
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

  const layerIds = useMemo(
    () => optimisticLayers.map((l) => l.id),
    [optimisticLayers]
  );

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

  // Stable layer item callbacks — extracted from the map loop to prevent per-render identity changes
  const handleItemSelect = useCallback(
    (id: number) => {
      if (!selectMode) onLayerSelect?.(id);
    },
    [selectMode, onLayerSelect]
  );
  const handleItemStartEdit = useCallback(
    (id: number, name: string) =>
      dispatchForm({ type: "START_EDIT", layerId: id, name }),
    [dispatchForm]
  );
  const handleItemCancelEdit = useCallback(
    () => dispatchForm({ type: "CANCEL_EDIT" }),
    [dispatchForm]
  );
  const handleItemEditNameChange = useCallback(
    (name: string) => dispatchForm({ type: "SET_EDIT_NAME", name }),
    [dispatchForm]
  );
  // Memoize otherLayers map to avoid new array per item per render
  const otherLayersMap = useMemo(() => {
    const m = new Map<number, { id: number; name: string; color: string }[]>();
    for (const l of optimisticLayers) {
      m.set(
        l.id,
        optimisticLayers
          .filter((other) => other.id !== l.id)
          .map((other) => ({
            id: other.id,
            name: other.name,
            color: other.color,
          }))
      );
    }
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Farbpalette wählen"
                    className="h-7 w-7 p-0 shrink-0"
                  />
                }
              >
                <Palette className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Farbpalette</DropdownMenuLabel>
                <DropdownMenuSeparator />
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
                  className="cursor-pointer"
                >
                  <Palette className="h-3.5 w-3.5 mr-2" />
                  <span className="text-sm">Optimaler Kontrast</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {optimisticLayers.length >= 2 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleSortByCount}
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                  />
                }
              >
                <ArrowDownUp className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Nach PLZ-Anzahl sortieren</p>
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
          {/* Layer action buttons — Conflicts always visible; secondary actions in dropdown */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    onClick={handleOpenConflicts}
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 gap-1.5 text-xs"
                  />
                }
              >
                <IconAlertTriangle className="h-3 w-3 shrink-0" />
                Konflikte
              </TooltipTrigger>
              <TooltipContent>
                <p>Konflikte anzeigen und lösen</p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
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
                {optimisticLayers.filter(
                  (l) => (l.postalCodes?.length ?? 0) > 0
                ).length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleBalanceLayers}
                      disabled={isBalancing}
                      className="gap-2 cursor-pointer"
                    >
                      <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">
                        {isBalancing
                          ? "Wird ausgeglichen…"
                          : "Ebenen ausgleichen"}
                      </span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Create new layer */}
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

          {/* Cross-area PLZ duplicate warning — collapsible */}
          {crossAreaDuplicatesByArea.size > 0 && (
            <ConflictBanner
              crossAreaDuplicates={crossAreaDuplicates}
              crossAreaDuplicatesByArea={crossAreaDuplicatesByArea}
            />
          )}

          {/* Layer list */}
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
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
                ...(gName !== null
                  ? [
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
                            transform: collapsedGroups.has(gName)
                              ? ""
                              : "rotate(90deg)",
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
                            onChange={(e) =>
                              setEditingGroupValue(e.target.value)
                            }
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
                      </div>,
                    ]
                  : []),
                ...(collapsedGroups.has(gName ?? "") && gName !== null
                  ? []
                  : gLayers.map((layer, layerIndex) => (
                      <LayerListItem
                        key={layer.id}
                        layer={layer}
                        activeLayerId={activeLayerId}
                        isLayerSwitchPending={isLayerSwitchPending}
                        duplicateCount={
                          duplicateCountByLayer.get(layer.id) ?? 0
                        }
                        editingLayerId={form.editingLayerId}
                        editingLayerName={form.editingLayerName}
                        editLayerInputRef={editLayerInputRef}
                        onSelect={handleLayerSelect}
                        onStartEdit={handleLayerStartEdit}
                        onConfirmEdit={handleRenameLayer}
                        onCancelEdit={handleLayerCancelEdit}
                        onEditNameChange={handleLayerEditNameChange}
                        onColorChange={handleColorChange}
                        onOpacityChange={handleOpacityChange}
                        onDelete={handleDeleteLayer}
                        onDuplicateLayer={handleDuplicateLayer}
                        onCopyToArea={handleOpenCopyToArea}
                        onMergeLayer={
                          (otherLayersMap.get(layer.id)?.length ?? 0) > 0
                            ? handleOpenMergeLayers
                            : undefined
                        }
                        onToggleVisibility={handleToggleVisibility}
                        onSoloLayer={handleSoloLayer}
                        onRemovePostalCode={guardedRemovePostalCode}
                        onImportCSV={
                          addPostalCodesToLayer ? guardedImportCSV : undefined
                        }
                        onNotesChange={handleNotesChange}
                        onMovePlz={handleMovePlz}
                        otherLayers={
                          otherLayersMap.get(layer.id) ?? EMPTY_ARRAY
                        }
                        isSelected={
                          selectMode ? selectedIds.has(layer.id) : undefined
                        }
                        onToggleSelect={selectMode ? toggleSelect : undefined}
                        isLocked={isLocked(layer.id)}
                        onToggleLock={toggleLock}
                        onPreviewPostalCode={onPreviewPostalCode}
                        onZoomToLayer={onZoomToLayer}
                        onClearPLZ={handleClearLayerPLZ}
                        onAddPlzRange={addPostalCodesToLayer ?? undefined}
                        allCodesSet={allCodesSet}
                        onBulkMovePlz={handleBulkMovePlz}
                        onBulkRemovePlz={handleBulkRemovePlz}
                        onExportCSV={handleExportLayerCSV}
                        onSplitLayer={handleSplitLayer}
                        onCompareLayer={openDiffDialog}
                        onSetGroup={handleSetLayerGroup}
                        existingGroups={existingGroups}
                        layerIndex={layerIndex}
                        maxLayerPLZ={maxLayerPLZ}
                        onHighlightCodes={onHighlightCodes}
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
                      ? [
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
                                transform: collapsedGroups.has(gName)
                                  ? ""
                                  : "rotate(90deg)",
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
                                onChange={(e) =>
                                  setEditingGroupValue(e.target.value)
                                }
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
                          </div>,
                        ]
                      : []),
                    ...(collapsedGroups.has(gName ?? "") && gName !== null
                      ? []
                      : gLayers.map((layer, layerIndex) => (
                          <SortableLayerListItem
                            key={layer.id}
                            layer={layer}
                            activeLayerId={activeLayerId}
                            isLayerSwitchPending={isLayerSwitchPending}
                            duplicateCount={
                              duplicateCountByLayer.get(layer.id) ?? 0
                            }
                            editingLayerId={form.editingLayerId}
                            editingLayerName={form.editingLayerName}
                            editLayerInputRef={editLayerInputRef}
                            onSelect={handleItemSelect}
                            onStartEdit={handleItemStartEdit}
                            onConfirmEdit={handleRenameLayer}
                            onCancelEdit={handleItemCancelEdit}
                            onEditNameChange={handleItemEditNameChange}
                            onColorChange={handleColorChange}
                            onOpacityChange={handleOpacityChange}
                            onDelete={handleDeleteLayer}
                            onDuplicateLayer={handleDuplicateLayer}
                            onCopyToArea={handleOpenCopyToArea}
                            onMergeLayer={
                              (otherLayersMap.get(layer.id)?.length ?? 0) > 0
                                ? handleOpenMergeLayers
                                : undefined
                            }
                            onToggleVisibility={handleToggleVisibility}
                            onSoloLayer={handleSoloLayer}
                            onRemovePostalCode={guardedRemovePostalCode}
                            onImportCSV={
                              addPostalCodesToLayer
                                ? guardedImportCSV
                                : undefined
                            }
                            onNotesChange={handleNotesChange}
                            onMovePlz={handleMovePlz}
                            otherLayers={
                              otherLayersMap.get(layer.id) ?? EMPTY_ARRAY
                            }
                            isSelected={
                              selectMode ? selectedIds.has(layer.id) : undefined
                            }
                            onToggleSelect={
                              selectMode ? toggleSelect : undefined
                            }
                            isLocked={isLocked(layer.id)}
                            onToggleLock={toggleLock}
                            onPreviewPostalCode={onPreviewPostalCode}
                            onZoomToLayer={onZoomToLayer}
                            onClearPLZ={handleClearLayerPLZ}
                            onAddPlzRange={addPostalCodesToLayer ?? undefined}
                            allCodesSet={allCodesSet}
                            onBulkMovePlz={handleBulkMovePlz}
                            onBulkRemovePlz={handleBulkRemovePlz}
                            onExportCSV={handleExportLayerCSV}
                            onSplitLayer={handleSplitLayer}
                            onCompareLayer={openDiffDialog}
                            onSetGroup={handleSetLayerGroup}
                            existingGroups={existingGroups}
                            layerIndex={layerIndex}
                            maxLayerPLZ={maxLayerPLZ}
                            onHighlightCodes={onHighlightCodes}
                          />
                        ))),
                  ])}
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
                  <span className="font-medium text-foreground">
                    {layerStats.uniqueCodes}
                  </span>{" "}
                  eindeutige PLZ
                </span>
                {layerStats.duplicateCodes > 0 && (
                  <button
                    type="button"
                    className="text-amber-500 font-medium hover:text-amber-600 transition-colors"
                    onClick={() => setShowDuplicates((v) => !v)}
                    title="Doppelte PLZ anzeigen"
                  >
                    {layerStats.duplicateCodes}✕ doppelt
                  </button>
                )}
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">
                    {layerStats.totalCodes}
                  </span>{" "}
                  gesamt
                  <button
                    type="button"
                    title="Statistiken als CSV exportieren"
                    className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      const rows = ["Gebiet,PLZ-Anzahl,Anteil"];
                      const total = layerStats.totalCodes;
                      for (const layer of optimisticLayers) {
                        const count = layer.postalCodes?.length ?? 0;
                        const pct =
                          total > 0
                            ? ((count / total) * 100).toFixed(1)
                            : "0.0";
                        rows.push(
                          `"${layer.name.replace(/"/g, '""')}",${count},${pct}%`
                        );
                      }
                      rows.push(`"Gesamt",${total},100.0%`);
                      const csv = rows.join("\n");
                      const blob = new Blob([csv], {
                        type: "text/csv;charset=utf-8;",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "plz-statistiken.csv";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-2.5 w-2.5" />
                  </button>
                </span>
              </div>
              {/* Duplicate PLZ detail panel */}
              {showDuplicates && duplicateCodeMap.size > 0 && (
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
                            await fixDuplicateCodeAction(
                              areaId,
                              code,
                              layerIds
                            );
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
                              setTimeout(
                                () => onPreviewPostalCode?.(null),
                                2000
                              );
                            }}
                          >
                            {code}
                          </button>
                          <span className="text-muted-foreground shrink-0">
                            →
                          </span>
                          <span className="flex gap-0.5 flex-wrap flex-1">
                            {layerIds.map((id: number) => {
                              const l = optimisticLayers.find(
                                (x) => x.id === id
                              );
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
              )}
              {/* PLZ range */}
              {layerStats.minCode &&
                layerStats.maxCode &&
                layerStats.minCode !== layerStats.maxCode && (
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span>Bereich:</span>
                    <span className="font-mono font-medium text-foreground">
                      {layerStats.minCode}
                    </span>
                    <span>–</span>
                    <span className="font-mono font-medium text-foreground">
                      {layerStats.maxCode}
                    </span>
                  </div>
                )}
              {/* PLZ prefix distribution (2-digit) — collapsible sparkline */}
              {layerStats.prefixDistribution.length > 1 && (
                <Collapsible defaultOpen={false}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-[9px] text-muted-foreground font-medium uppercase tracking-wide w-full hover:text-foreground transition-colors py-0.5 [&>svg]:transition-transform [&[data-panel-open]>svg]:rotate-0 [&>svg]:-rotate-90">
                    <ChevronDown className="h-2.5 w-2.5" />
                    PLZ-Verteilung nach Vorwahl
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-0.5">
                    <div className="flex items-end gap-px h-8 overflow-x-auto">
                      {(() => {
                        const max = Math.max(
                          ...layerStats.prefixDistribution.map((p) => p.count)
                        );
                        return layerStats.prefixDistribution.map(
                          ({ prefix, count }) => (
                            <div
                              key={prefix}
                              className="flex flex-col items-center gap-px flex-1 min-w-[8px] group"
                              title={`${prefix}xxx: ${count} PLZ`}
                            >
                              <div
                                className="w-full rounded-sm bg-primary/60 group-hover:bg-primary transition-colors"
                                style={{
                                  height: `${Math.max(2, (count / max) * 24)}px`,
                                }}
                              />
                            </div>
                          )
                        );
                      })()}
                    </div>
                    <div className="flex justify-between text-[8px] text-muted-foreground/60">
                      <span>{layerStats.prefixDistribution[0]?.prefix}xx</span>
                      <span>
                        {
                          layerStats.prefixDistribution[
                            Math.floor(layerStats.prefixDistribution.length / 2)
                          ]?.prefix
                        }
                        xx
                      </span>
                      <span>
                        {
                          layerStats.prefixDistribution[
                            layerStats.prefixDistribution.length - 1
                          ]?.prefix
                        }
                        xx
                      </span>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          {/* PLZ quick-find */}
          <div className="border-t pt-1.5 mt-0.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                ref={plzFindInputRef}
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
                  <p className="text-[10px] text-muted-foreground py-0.5">
                    Keine Treffer
                  </p>
                ) : (
                  plzFindResults.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start gap-1.5 text-[10px]"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0 mt-0.5"
                        style={{ backgroundColor: r.color }}
                      />
                      <span className="font-medium truncate max-w-[80px]">
                        {r.name}
                      </span>
                      <span className="text-muted-foreground ml-auto font-mono flex gap-0.5 flex-wrap justify-end">
                        {r.matchingCodes.map((code) => (
                          <button
                            key={code}
                            type="button"
                            title={`Zur PLZ ${code} springen`}
                            className="hover:text-foreground hover:underline transition-colors cursor-pointer"
                            onClick={() => {
                              onPreviewPostalCode?.(code);
                              setTimeout(
                                () => onPreviewPostalCode?.(null),
                                2000
                              );
                            }}
                          >
                            {code}
                          </button>
                        ))}
                        {r.matchingCodes.length === 5 ? "…" : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* PLZ prefix / range bulk-add */}
          {allCodesSet &&
            allCodesSet.size > 0 &&
            activeLayerId &&
            addPostalCodesToLayer && (
              <div className="border-t pt-1.5 mt-0.5">
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <Input
                      value={prefixInput}
                      onChange={(e) => setPrefixInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && prefixMatches?.length)
                          handleAddByPrefix();
                      }}
                      placeholder="Präfix (80) oder Bereich (80-89)"
                      className="h-6 text-[10px] pr-2"
                      maxLength={9}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddByPrefix}
                    disabled={!prefixMatches?.length}
                    className="h-6 px-2 text-[10px] rounded border border-input bg-background hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed shrink-0 font-medium"
                  >
                    {prefixMatches !== null
                      ? `+${prefixMatches.length}`
                      : "Hinzufügen"}
                  </button>
                </div>
                {prefixInput.trim() &&
                  prefixMatches !== null &&
                  prefixMatches.length === 0 && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Keine PLZ gefunden
                    </p>
                  )}
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

      <Separator />
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
                  { keys: ["F1–F9"], desc: "Direkt zu Ebene 1–9 wechseln" },
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
      });
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

      // F1-F9: switch to layer 1-9 directly
      const f1f9Match = /^F([1-9])$/.exec(e.key);
      if (f1f9Match && !isInInput) {
        const idx = Number(f1f9Match[1]) - 1;
        const currentLayers = layersRef.current;
        if (idx < currentLayers.length) {
          e.preventDefault();
          onLayerSelectRef.current?.(currentLayers[idx].id);
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
      className="gap-2 max-w-md flex flex-col max-h-full min-h-0"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Kartentools</CardTitle>
        {areaName && (
          <div className="mt-0.5">
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
                className="w-full mt-0.5 text-xs text-muted-foreground bg-muted border border-input rounded px-1.5 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (areaId && !isViewingVersion) setDescEditing(true);
                }}
                title={isViewingVersion ? undefined : "Beschreibung bearbeiten"}
                className="w-full text-left mt-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {descDraft ||
                  (isViewingVersion ? (
                    ""
                  ) : (
                    <span className="italic opacity-50">
                      Beschreibung hinzufügen…
                    </span>
                  ))}
              </button>
            )}
            {areaId && !isViewingVersion && (
              <div className="mt-1.5">
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
            allCodesSet={allCodesSet}
            onLayerUpdate={onLayerUpdate}
            onHighlightCodes={onHighlightCodes}
            handleExportLayerCSV={handleExportLayerCSV}
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
          onExportZip={handleExportZip}
          onImportData={handleTriggerImportData}
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

        {/* Stats Section */}
        {postalCodesData && (
          <StatsSection
            layers={optimisticLayers}
            postalCodesData={postalCodesData}
            onLayerSelect={onLayerSelect}
            open={ui.statsOpen}
            onOpenChange={handleSetStatsOpen}
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
