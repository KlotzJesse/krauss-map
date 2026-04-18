"use no memo";
import {
  Camera,
  Home,
  Layers,
  LocateFixed,
  Maximize2,
  Printer,
  PlusIcon,
  Eye,
  EyeOff,
  Search,
  X,
  MoveRight,
  Copy,
} from "lucide-react";
import maplibregl from "maplibre-gl";
import dynamic from "next/dynamic";
import {
  Component,
  memo,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  Activity,
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Map, useMap } from "react-map-gl/maplibre";

import {
  DrawingToolsErrorBoundary,
  MapErrorBoundary,
} from "@/components/ui/error-boundaries";

import "maplibre-gl/dist/maplibre-gl.css";
import { DrawingToolsSkeleton } from "@/components/ui/loading-skeletons";
import { useSidebar } from "@/components/ui/sidebar";
import {
  COUNTRY_CONFIGS,
  DACH_CENTER,
  DACH_ZOOM,
} from "@/lib/config/countries";
import { useCountryShapesData } from "@/lib/hooks/use-country-shapes-data";
import { useDeckLayers } from "@/lib/hooks/use-deck-layers";
import {
  useMapInteractions,
  type PlzReassignInfo,
} from "@/lib/hooks/use-map-interactions";
import {
  getFirstSymbolLayerId,
  useMapLabels,
} from "@/lib/hooks/use-map-labels";
import { useMapOptimizations } from "@/lib/hooks/use-map-optimizations";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { useStatesData } from "@/lib/hooks/use-states-data";
import {
  useActiveLayerState,
  useSetMapCenterZoom,
} from "@/lib/url-state/map-state";
import { cn } from "@/lib/utils";
import type {
  BaseMapProps,
  MapErrorMessageProps,
  ToggleButtonProps,
} from "@/types/base-map";

import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { DeckGLOverlay } from "./deck-gl-overlay";
import { MapBookmarks } from "./map-bookmarks";

// Lazy-loaded conflict resolution panel (side panel, not modal)
const ConflictResolutionPanel = dynamic(
  () =>
    import("../areas/conflict-resolution-dialog").then(
      (m) => m.ConflictResolutionPanel
    ),
  { ssr: false }
);

// Memoized drawing tools component with lazy loading for performance
const DrawingTools = dynamic(
  () => import("./drawing-tools").then((m) => m.DrawingTools),
  {
    ssr: false,
    loading: () => <DrawingToolsSkeleton />,
  }
);

// Floating drawing toolbar for center map overlay
const FloatingDrawingToolbar = dynamic(
  () =>
    import("./floating-drawing-toolbar").then((m) => m.FloatingDrawingToolbar),
  {
    ssr: false,
  }
);

// Floating edit bar shown when a drawn shape is selected
const FloatingDrawingEditBar = dynamic(
  () =>
    import("./floating-drawing-edit-bar").then((m) => m.FloatingDrawingEditBar),
  {
    ssr: false,
  }
);

// Static style objects — hoisted to avoid allocating new objects on every render
const MAP_CONTAINER_STYLE = { minHeight: "400px" } as const;
const MAP_STYLE = { width: "100%", height: "100%" } as const;

// Memoized error message component to prevent re-renders
const MapErrorMessage = memo(({ message }: MapErrorMessageProps) => (
  <div className="flex items-center justify-center w-full h-full min-h-[400px] text-destructive">
    {message}
  </div>
));
MapErrorMessage.displayName = "MapErrorMessage";

// Memoized toggle button component to prevent re-renders
const ToggleButton = memo(
  ({ onClick, title, ariaLabel, children }: ToggleButtonProps) => (
    <Button onClick={onClick} title={title} aria-label={ariaLabel}>
      {children}
    </Button>
  )
);
ToggleButton.displayName = "ToggleButton";

/**
 * Auto-recovering error boundary for the Map component.
 * react-map-gl throws during concurrent renders after map.remove() — this boundary
 * catches the transient error and immediately remounts the Map on the next frame.
 */
class MapRecoveryBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    // Only auto-recover from known map destruction errors
    const isMapDestroyedError =
      error.message?.includes("_loaded") ||
      error.message?.includes("getProjection") ||
      error.message?.includes("getSource") ||
      error.message?.includes("getLayer") ||
      error.message?.includes("getStyle");
    if (isMapDestroyedError) {
      // Schedule reset on next frame — the new render will create a fresh map
      requestAnimationFrame(() => {
        this.setState({ hasError: false });
      });
    }
  }

  render() {
    if (this.state.hasError) {
      // Return minimal placeholder during the single-frame recovery
      return <div className="w-full h-full" />;
    }
    return this.props.children;
  }
}

function MapLegend({
  layers,
  activeLayerId,
  unassignedCount,
  onZoomToLayer,
}: {
  layers: BaseMapProps["layers"];
  activeLayerId?: number | null;
  unassignedCount?: number;
  onZoomToLayer?: (layerId: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const allLayers = layers.filter((l) => (l.postalCodes?.length ?? 0) > 0);
  const showUnassignedEntry = (unassignedCount ?? 0) > 0;
  if (allLayers.length === 0 && !showUnassignedEntry) return null;

  const totalPLZ = allLayers.reduce(
    (s, x) => s + (x.postalCodes?.length ?? 0),
    0
  );

  return (
    <div className="absolute bottom-20 right-4 z-10 print:hidden">
      <div className="bg-white/95 border border-border rounded-lg shadow-md overflow-hidden max-w-[200px]">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <span>Legende</span>
          <span className="text-muted-foreground">{collapsed ? "▲" : "▼"}</span>
        </button>
        {!collapsed && (
          <div className="px-2.5 pb-2 space-y-0.5 max-h-48 overflow-y-auto">
            {allLayers.map((l) => {
              const count = l.postalCodes?.length ?? 0;
              const pct =
                totalPLZ > 0 ? Math.round((count / totalPLZ) * 100) : 0;
              const isActive = activeLayerId === l.id;
              const isHidden = l.isVisible === "false";
              return (
                <button
                  key={l.id}
                  type="button"
                  title={`${l.name} — ${count} PLZ · Klicken zum Zentrieren${isHidden ? " (ausgeblendet)" : ""}`}
                  onClick={() => onZoomToLayer?.(l.id)}
                  className={cn(
                    "w-full flex items-center gap-1.5 text-left rounded transition-colors",
                    "hover:bg-muted/70 cursor-pointer",
                    isActive ? "font-semibold bg-muted/60 px-1 -mx-1" : "px-0",
                    isHidden && "opacity-40"
                  )}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 border border-black/10"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="text-[10px] text-foreground truncate leading-tight flex-1">
                    {l.name}
                  </span>
                  {isHidden && (
                    <EyeOff className="h-2.5 w-2.5 shrink-0 text-muted-foreground/60" />
                  )}
                  <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
                    {count}
                  </span>
                  <span className="text-[8px] text-muted-foreground/60 shrink-0 tabular-nums w-7 text-right">
                    {pct}%
                  </span>
                </button>
              );
            })}
            {showUnassignedEntry && (
              <div className="flex items-center gap-1.5 border-t border-border/50 pt-1 mt-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 border border-red-300"
                  style={{ backgroundColor: "rgba(239,68,68,0.25)" }}
                />
                <span className="text-[10px] text-muted-foreground truncate leading-tight italic">
                  Nicht zugeordnet
                </span>
                <span className="text-[9px] text-red-500 shrink-0 ml-auto">
                  {unassignedCount?.toLocaleString("de-DE")}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import type {
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Feature,
} from "geojson";

function PlzSearch({
  data,
  featureIndex,
  country,
}: {
  data: FeatureCollection<Polygon | MultiPolygon>;
  featureIndex?: Map<string, Feature<Polygon | MultiPolygon>[]>;
  country?: string;
}) {
  const { current: mapRef } = useMap();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const code = query.trim();
      if (!code || !mapRef) return;
      const key = country ? `${country}:${code}` : code;
      const features = featureIndex?.get(key) ?? featureIndex?.get(code);
      if (!features || features.length === 0) return;
      // Compute bounding box of first feature
      const allCoords: number[][] = [];
      for (const ft of features) {
        const geom = ft.geometry;
        if (geom.type === "Polygon") {
          for (const ring of geom.coordinates) {
            for (const c of ring) allCoords.push(c);
          }
        } else if (geom.type === "MultiPolygon") {
          for (const poly of geom.coordinates) {
            for (const ring of poly) {
              for (const c of ring) allCoords.push(c);
            }
          }
        }
      }
      if (allCoords.length === 0) return;
      const lngs = allCoords.map((c) => c[0]);
      const lats = allCoords.map((c) => c[1]);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      mapRef.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 80, duration: 800 }
      );
      setOpen(false);
      setQuery("");
    },
    [query, mapRef, featureIndex, country]
  );

  return (
    <div className="absolute top-4 right-4 z-10 print:hidden">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          title="PLZ suchen und anspringen"
          aria-label="PLZ suchen"
          className="flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
      ) : (
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-1 bg-white/95 border border-border rounded-lg shadow-md px-2 py-1"
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="PLZ eingeben…"
            className="text-xs outline-none bg-transparent w-28 placeholder:text-muted-foreground"
            onKeyDown={(e) =>
              e.key === "Escape" && (setOpen(false), setQuery(""))
            }
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
            aria-label="Suche schließen"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Inner map component — must be a child of <Map> to use useMap() hook.
 * Manages TerraDraw integration via raw MapLibre instance and labels via hybrid approach.
 */
const MapInner = memo(function MapInner({
  data,
  layerId,
  granularity,
  country,
  onGranularityChange,
  layers,
  activeLayerId,
  areaId,
  areaName,
  areaDescription,
  areaTags,
  previewPostalCode,
  onSetPreviewPostalCode,
  onZoomToLayer,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
  isViewingVersion,
  versionId,
  versions,
  changes,
  initialUndoRedoStatus,
  onCycleMapStyle,
  mapStyleLabel,
  mapStyles,
  onSetMapStyle,
  onSnapshotReady,
}: Omit<BaseMapProps, "center" | "zoom"> & {
  onCycleMapStyle?: () => void;
  mapStyleLabel?: string;
  mapStyles?: readonly { id: string; label: string }[];
  onSetMapStyle?: (id: string) => void;
  onSnapshotReady?: (blob: Blob) => void;
}) {
  const { current: mapRef } = useMap();
  const rawMapRef = useRef<maplibregl.Map | null>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const setMapCenterZoom = useSetMapCenterZoom();
  const [isGeolocating, setIsGeolocating] = useState(false);
  const { toggleSidebar } = useSidebar();

  const handleRecenter = useCallback(() => {
    const config = country ? COUNTRY_CONFIGS[country] : undefined;
    const center = config?.center ?? ([10.4515, 51.1657] as [number, number]);
    const zoom = config?.zoom ?? 5;
    setMapCenterZoom(center, zoom);
  }, [country, setMapCenterZoom]);

  const handleBookmarkJump = useCallback(
    (center: [number, number], zoom: number) => {
      setMapCenterZoom(center, zoom);
    },
    [setMapCenterZoom]
  );

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapCenterZoom([pos.coords.longitude, pos.coords.latitude], 13);
        setIsGeolocating(false);
      },
      () => {
        setIsGeolocating(false);
      },
      { timeout: 8000 }
    );
  }, [setMapCenterZoom]);

  // Conflict resolution panel state (lifted from DrawingTools)
  const [showConflicts, setShowConflicts] = useState(false);
  const [highlightedConflictCodes, setHighlightedConflictCodes] =
    useState<Set<string> | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(false);

  // PLZ reassign popup — shown when clicking a PLZ that belongs to a different layer
  const [reassignPopup, setReassignPopup] = useState<PlzReassignInfo | null>(
    null
  );
  const handleNeedsReassign = useCallback((info: PlzReassignInfo) => {
    setReassignPopup(info);
  }, []);

  // Close reassign popup on ESC
  useEffect(() => {
    if (!reassignPopup) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReassignPopup(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [reassignPopup]);

  const handleOpenConflicts = useCallback(() => setShowConflicts(true), []);
  const handleCloseConflicts = useCallback(() => {
    setShowConflicts(false);
    setHighlightedConflictCodes(null);
  }, []);

  // Get raw MapLibre instance for TerraDraw and labels
  useEffect(() => {
    if (!mapRef) {
      return;
    }
    let raw: maplibregl.Map;
    try {
      raw = mapRef.getMap();
    } catch {
      // Map may have been removed during navigation
      return;
    }
    rawMapRef.current = raw;
    mapCanvasRef.current = raw.getCanvas();

    const navControl = new maplibregl.NavigationControl({
      visualizePitch: false,
    });
    raw.addControl(navControl, "bottom-right");

    const handleLoad = () => setIsMapLoaded(true);

    if (raw.loaded()) {
      setIsMapLoaded(true);
    } else {
      raw.once("load", handleLoad);
    }

    return () => {
      raw.off("load", handleLoad);
      try {
        raw.removeControl(navControl);
      } catch {
        /* already removed */
      }
      setIsMapLoaded(false);
    };
  }, [mapRef]);

  // URL state management (narrow: only layer switching, not view state)
  const { setActiveLayer, isLayerPending } = useActiveLayerState();

  // States data fetched client-side to avoid 246KB RSC payload bloat
  // Unified DACH map: load all states regardless of area country
  const statesData = useStatesData();
  const countryShapesData = useCountryShapesData();

  // Performance optimizations with memoized computations
  const optimizations = useMapOptimizations({ data, statesData });

  // Map interactions (drawing tools, TerraDraw, click handler)
  const interactions = useMapInteractions({
    mapRef: rawMapRef,
    data,
    isMapLoaded,
    areaId,
    activeLayerId,
    layers,
    addPostalCodesToLayer,
    removePostalCodesFromLayer,
    onNeedsReassign: handleNeedsReassign,
  });

  // Resolve basemap symbol layer for deck.gl beforeId (survives style transitions)
  const firstSymbolLayerId =
    isMapLoaded && rawMapRef.current
      ? getFirstSymbolLayerId(rawMapRef.current)
      : undefined;

  // deck.gl layers (polygons, fills, hover, preview) — cursor managed via direct DOM ref
  const { deckLayers, onHover, hoverTooltip, unassignedCount } = useDeckLayers({
    data,
    statesData,
    countryShapesData,
    layers,
    activeLayerId,
    previewPostalCode,
    featureIndex: optimizations.featureIndex,
    isCursorMode: interactions.isCursorMode,
    mapCanvasRef,
    country,
    beforeId: firstSymbolLayerId,
    highlightedCodes: highlightedConflictCodes,
    showUnassigned,
  });

  // MapLibre native labels (hybrid escape hatch)
  useMapLabels({
    mapInstance: rawMapRef.current,
    isMapLoaded,
    layerId,
    data,
    labelPoints: optimizations.labelPoints,
    statesLabelPoints: optimizations.statesLabelPoints,
    layers,
    featureIndex: optimizations.featureIndex,
    country,
  });

  const handleScreenshot = useCallback(() => {
    const canvas = rawMapRef.current?.getCanvas();
    if (!canvas) return;
    if (onSnapshotReady) {
      canvas.toBlob((blob) => {
        if (blob) onSnapshotReady(blob);
      }, "image/png");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `karte-${areaName ?? "export"}-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, [areaName, onSnapshotReady]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleFitAllLayers = useCallback(() => {
    if (!data?.features || !layers?.length) return;
    const allCodes = new Set(
      layers.flatMap((l) => l.postalCodes?.map((pc) => pc.postalCode) ?? [])
    );
    if (allCodes.size === 0) return;

    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;
    let found = false;

    for (const feature of data.features) {
      if (!allCodes.has(feature.properties?.code)) continue;
      found = true;
      const geom = feature.geometry;
      const rings: number[][][] =
        geom.type === "Polygon"
          ? geom.coordinates
          : geom.type === "MultiPolygon"
            ? geom.coordinates.flat()
            : [];
      for (const ring of rings) {
        for (const [lng, lat] of ring) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }

    if (!found) return;
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const span = Math.max(maxLng - minLng, maxLat - minLat);
    const zoom = Math.max(
      5,
      Math.min(13, Math.round(Math.log2(360 / span)) - 1)
    );
    setMapCenterZoom([centerLng, centerLat], zoom);
  }, [data, layers, setMapCenterZoom]);

  // G key: zoom to fit all layers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "g" && e.key !== "G") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      handleFitAllLayers();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleFitAllLayers]);

  // H key: toggle sidebar visibility
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "h" && e.key !== "H") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      toggleSidebar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  // M key: cycle map style
  useEffect(() => {
    if (!onCycleMapStyle) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "m" && e.key !== "M") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      onCycleMapStyle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCycleMapStyle]);

  // +/- keys: zoom in/out
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      const map = rawMapRef.current;
      if (!map) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        map.zoomIn({ duration: 200 });
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        map.zoomOut({ duration: 200 });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // startTransition-wrapped handlers to defer heavy subtree re-renders
  const handleShowTools = useStableCallback(() =>
    startTransition(() => interactions.showTools())
  );
  const handleHideTools = useStableCallback(() =>
    startTransition(() => interactions.hideTools())
  );
  const handleClearAll = useStableCallback(() =>
    startTransition(() => interactions.clearAll())
  );
  const handleDeleteEditingFeature = useStableCallback(() =>
    startTransition(() => interactions.deleteEditingFeature())
  );
  const handleDeselectEditingFeature = useStableCallback(() =>
    startTransition(() => interactions.deselectEditingFeature())
  );

  return (
    <>
      <DeckGLOverlay
        layers={deckLayers}
        onHover={onHover}
        onClick={interactions.handleDeckClick}
      />

      {/* Floating Drawing Toolbar - Center bottom */}
      <FloatingDrawingToolbar
        currentMode={interactions.currentDrawingMode}
        onModeChange={interactions.handleDrawingModeChange}
        areaId={areaId}
        initialUndoRedoStatus={initialUndoRedoStatus}
        isPanelOpen={interactions.isDrawingToolsVisible}
      />
      {/* Edit bar - appears above the toolbar when a drawn shape is selected */}
      {interactions.editingFeatureId && (
        <FloatingDrawingEditBar
          onDelete={handleDeleteEditingFeature}
          onDismiss={handleDeselectEditingFeature}
        />
      )}

      <Activity
        mode={interactions.isDrawingToolsVisible ? "visible" : "hidden"}
      >
        <div
          className="absolute top-4 left-4 bottom-4 z-10 flex flex-col"
          role="region"
          aria-label="Kartentools-Panel"
        >
          <DrawingToolsErrorBoundary>
            <Suspense fallback={<DrawingToolsSkeleton />}>
              <DrawingTools
                currentMode={interactions.currentDrawingMode}
                onModeChange={interactions.handleDrawingModeChange}
                onClearAll={handleClearAll}
                onToggleVisibility={handleHideTools}
                granularity={granularity}
                onGranularityChange={onGranularityChange}
                postalCodesData={data}
                pendingPostalCodes={interactions.pendingPostalCodes}
                onAddPending={interactions.addPendingToSelection}
                onRemovePending={interactions.removePendingFromSelection}
                areaId={areaId ?? undefined}
                areaName={areaName}
                areaDescription={areaDescription}
                areaTags={areaTags}
                activeLayerId={activeLayerId}
                onLayerSelect={setActiveLayer}
                isLayerSwitchPending={isLayerPending}
                addPostalCodesToLayer={addPostalCodesToLayer}
                removePostalCodesFromLayer={removePostalCodesFromLayer}
                layers={layers}
                isViewingVersion={isViewingVersion}
                country={country}
                versionId={versionId}
                versions={versions}
                changes={changes}
                onOpenConflicts={handleOpenConflicts}
                undoRedoStatus={initialUndoRedoStatus}
                onPreviewPostalCode={onSetPreviewPostalCode}
                onZoomToLayer={onZoomToLayer}
                onHighlightCodes={setHighlightedConflictCodes}
              />
            </Suspense>
          </DrawingToolsErrorBoundary>
        </div>
      </Activity>

      <Activity
        mode={!interactions.isDrawingToolsVisible ? "visible" : "hidden"}
      >
        <div
          className="absolute top-4 left-4 z-10"
          role="region"
          aria-label="Kartentools-Panel"
        >
          <ToggleButton
            onClick={handleShowTools}
            title="Kartentools anzeigen"
            ariaLabel="Kartentools-Panel anzeigen"
          >
            <PlusIcon width={24} height={24} />
          </ToggleButton>
        </div>
      </Activity>

      {/* Screenshot + Print buttons - top left when panel open, bottom left otherwise */}
      <div
        className={`absolute z-10 flex flex-col gap-1 print:hidden transition-all duration-200 ${
          interactions.isDrawingToolsVisible
            ? "top-4 left-[472px]"
            : "bottom-4 left-4"
        }`}
      >
        <button
          type="button"
          onClick={handleScreenshot}
          title="Karte als PNG speichern"
          aria-label="Screenshot der Karte erstellen"
          className="flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground"
        >
          <Camera className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handlePrint}
          title="Karte drucken"
          aria-label="Karte drucken"
          className="flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground"
        >
          <Printer className="h-4 w-4" />
        </button>
        {layers?.some((l) => (l.postalCodes?.length ?? 0) > 0) && (
          <button
            type="button"
            onClick={handleFitAllLayers}
            title="Alle Ebenen anzeigen (G)"
            aria-label="Karte auf alle Ebenen ausrichten (G)"
            className="flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleRecenter}
          title="Zur Länderübersicht"
          aria-label="Zur Länderübersicht zoomen"
          className="flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground"
        >
          <Home className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleGeolocate}
          title="Meinen Standort anzeigen"
          aria-label="Zum aktuellen Standort navigieren"
          disabled={isGeolocating}
          className="flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-wait"
        >
          <LocateFixed
            className={`h-4 w-4 ${isGeolocating ? "animate-pulse" : ""}`}
          />
        </button>
        {onCycleMapStyle && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title={`Kartenstil: ${mapStyleLabel ?? ""}`}
                  aria-label="Kartenstil wählen"
                  className="flex items-center gap-1.5 px-2 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground text-xs font-medium"
                />
              }
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{mapStyleLabel}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-32">
              {(mapStyles ?? []).map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => onSetMapStyle?.(s.id)}
                  className={cn(
                    "text-xs",
                    s.label === mapStyleLabel && "font-semibold text-primary"
                  )}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          onClick={() => setShowUnassigned(!showUnassigned)}
          title={
            showUnassigned
              ? "Freie PLZ ausblenden"
              : `Freie PLZ anzeigen — ${unassignedCount.toLocaleString("de-DE")} nicht zugeordnet`
          }
          aria-label="Nicht zugeordnete PLZ anzeigen/ausblenden"
          className={cn(
            "flex items-center gap-1.5 px-2 h-8 rounded-md border shadow-sm transition-colors text-xs font-medium",
            showUnassigned
              ? "bg-red-100 border-red-300 text-red-600 hover:bg-red-50"
              : unassignedCount > 0
                ? "bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100"
                : "bg-white/90 border-border text-muted-foreground hover:bg-white hover:text-foreground"
          )}
        >
          {showUnassigned ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {unassignedCount > 0 && (
            <span>{unassignedCount.toLocaleString("de-DE")}</span>
          )}
        </button>
        <MapBookmarks
          getCurrentView={() => {
            const map = rawMapRef.current;
            if (!map)
              return {
                center: [10.4515, 51.1657] as [number, number],
                zoom: 5,
              };
            const c = map.getCenter();
            return {
              center: [c.lng, c.lat] as [number, number],
              zoom: map.getZoom(),
            };
          }}
          onJumpTo={handleBookmarkJump}
        />
      </div>

      {/* PLZ search overlay — top right */}
      <PlzSearch
        data={data}
        featureIndex={optimizations.featureIndex}
        country={country}
      />

      {/* Conflict resolution panel — right side, next to the map */}
      <Activity mode={showConflicts ? "visible" : "hidden"}>
        <div className="absolute top-20 right-4 bottom-4 z-10 w-96">
          <ConflictResolutionPanel
            onClose={handleCloseConflicts}
            onHighlightCodes={setHighlightedConflictCodes}
            areaId={areaId!}
            layers={layers ?? []}
            country={country}
            activeLayerId={activeLayerId}
          />
        </div>
      </Activity>

      {/* Map layer legend — bottom right */}
      {layers && layers.some((l) => (l.postalCodes?.length ?? 0) > 0) && (
        <MapLegend
          layers={layers}
          activeLayerId={activeLayerId}
          unassignedCount={unassignedCount}
          onZoomToLayer={onZoomToLayer}
        />
      )}

      {/* Hover tooltip */}
      {hoverTooltip && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{ left: hoverTooltip.x + 12, top: hoverTooltip.y - 10 }}
        >
          <div className="bg-popover/95 border border-border rounded shadow-md px-2 py-1.5 text-xs min-w-[80px]">
            <div className="font-mono font-semibold text-foreground">
              {hoverTooltip.code}
            </div>
            {hoverTooltip.layers.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {hoverTooltip.layers.map((l) => (
                  <div key={l.name} className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="text-muted-foreground truncate max-w-[140px]">
                      {l.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PLZ Reassign popup — click a PLZ that belongs to a different layer */}
      {reassignPopup && (
        <div
          className="absolute z-30"
          style={{
            left: Math.min(reassignPopup.x + 8, window.innerWidth - 260),
            top: Math.min(reassignPopup.y - 8, window.innerHeight - 200),
          }}
        >
          <div className="bg-popover border border-border rounded-lg shadow-xl p-3 w-56">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono font-bold text-sm text-foreground">
                {reassignPopup.code}
              </span>
              <button
                type="button"
                onClick={() => setReassignPopup(null)}
                className="text-muted-foreground hover:text-foreground transition-colors rounded p-0.5 hover:bg-muted"
                aria-label="Schließen"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="text-[11px] text-muted-foreground mb-2">
              Bereits in:
            </div>
            {reassignPopup.containingLayers.map((src) => (
              <div
                key={src.id}
                className="flex items-center gap-1.5 text-[11px] mb-1"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 border border-black/10"
                  style={{ backgroundColor: src.color }}
                />
                <span className="truncate flex-1 text-foreground">
                  {src.name}
                </span>
              </div>
            ))}

            {activeLayerId &&
              layers?.find((l) => l.id === activeLayerId) &&
              (() => {
                const activeLayer = layers.find((l) => l.id === activeLayerId);
                if (!activeLayer) return null;
                return (
                  <div className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
                    <button
                      type="button"
                      className="w-full flex items-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded hover:bg-primary/10 hover:text-primary transition-colors text-left"
                      onClick={async () => {
                        if (
                          !addPostalCodesToLayer ||
                          !removePostalCodesFromLayer
                        )
                          return;
                        setReassignPopup(null);
                        try {
                          // Remove from all other layers
                          await Promise.all(
                            reassignPopup.containingLayers.map((src) =>
                              removePostalCodesFromLayer(src.id, [
                                reassignPopup.code,
                              ])
                            )
                          );
                          // Add to active layer
                          await addPostalCodesToLayer(activeLayerId, [
                            reassignPopup.code,
                          ]);
                          const { toast: t } = await import("sonner");
                          t.success(
                            `PLZ ${reassignPopup.code} verschoben nach ${activeLayer.name}`,
                            { duration: 2000 }
                          );
                        } catch {
                          const { toast: t } = await import("sonner");
                          t.error("Fehler beim Verschieben", {
                            duration: 2000,
                          });
                        }
                      }}
                    >
                      <MoveRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        Verschieben nach{" "}
                        <span
                          className="font-semibold"
                          style={{ color: activeLayer.color ?? undefined }}
                        >
                          {activeLayer.name}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-1.5 rounded hover:bg-muted transition-colors text-left"
                      onClick={async () => {
                        if (!addPostalCodesToLayer) return;
                        setReassignPopup(null);
                        try {
                          await addPostalCodesToLayer(activeLayerId, [
                            reassignPopup.code,
                          ]);
                          const { toast: t } = await import("sonner");
                          t.success(
                            `PLZ ${reassignPopup.code} auch zu ${activeLayer.name} hinzugefügt`,
                            { duration: 2000 }
                          );
                        } catch {
                          const { toast: t } = await import("sonner");
                          t.error("Fehler beim Hinzufügen", { duration: 2000 });
                        }
                      }}
                    >
                      <Copy className="h-3 w-3 shrink-0" />
                      <span>Auch hinzufügen (Duplikat)</span>
                    </button>
                  </div>
                );
              })()}
          </div>
        </div>
      )}

      {/* Close reassign popup on Escape */}
      {reassignPopup && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: ESC handler via window
        <div
          className="fixed inset-0 z-[29]"
          onClick={() => setReassignPopup(null)}
          aria-hidden="true"
        />
      )}
    </>
  );
});
MapInner.displayName = "MapInner";

// Main BaseMap component with react-map-gl + deck.gl
const BaseMapComponent = ({
  data,
  layerId,
  center,
  zoom,
  country,
  granularity,
  onGranularityChange,
  layers,
  activeLayerId,
  areaId,
  areaName,
  areaDescription,
  areaTags,
  previewPostalCode,
  onSetPreviewPostalCode,
  onZoomToLayer,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
  isViewingVersion = false,
  versionId,
  versions,
  changes,
  initialUndoRedoStatus,
  onSnapshotReady,
}: BaseMapProps) => {
  const countryConfig = country ? COUNTRY_CONFIGS[country] : undefined;
  const effectiveCenter = center ?? countryConfig?.center ?? DACH_CENTER;
  const effectiveZoom = zoom ?? countryConfig?.zoom ?? DACH_ZOOM;
  // Controlled view state for URL sync (narrow: only setter, no view subscription)
  const setMapCenterZoom = useSetMapCenterZoom();
  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAP_STYLES = [
    { id: "colorful", label: "Bunt", url: "/versatilescolorful.json" },
    {
      id: "light",
      label: "Hell",
      url: "https://tiles.versatiles.org/styles/colorful/style.json",
    },
    {
      id: "neutrino",
      label: "Minimal",
      url: "https://demotiles.maplibre.org/style.json",
    },
  ] as const;
  type MapStyleId = (typeof MAP_STYLES)[number]["id"];

  const [mapStyleId, setMapStyleId] = useState<MapStyleId>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("map-style-id") as MapStyleId | null;
      if (saved && MAP_STYLES.some((s) => s.id === saved)) return saved;
    }
    return "colorful";
  });

  const currentMapStyle =
    MAP_STYLES.find((s) => s.id === mapStyleId)?.url ??
    "/versatilescolorful.json";

  const handleCycleMapStyle = useCallback(() => {
    const idx = MAP_STYLES.findIndex((s) => s.id === mapStyleId);
    const next = MAP_STYLES[(idx + 1) % MAP_STYLES.length];
    setMapStyleId(next.id);
    localStorage.setItem("map-style-id", next.id);
  }, [mapStyleId]);

  const [viewState, setViewState] = useState({
    longitude: effectiveCenter[0],
    latitude: effectiveCenter[1],
    zoom: effectiveZoom,
  });

  // Sync from URL changes (back/forward, saved views)
  useEffect(() => {
    setViewState((prev) => ({
      ...prev,
      longitude: effectiveCenter[0],
      latitude: effectiveCenter[1],
      zoom: effectiveZoom,
    }));
  }, [effectiveCenter, effectiveZoom]);

  // Handle map movement with debounced URL sync
  const handleMove = useCallback(
    (evt: {
      viewState: { longitude: number; latitude: number; zoom: number };
    }) => {
      setViewState(evt.viewState);

      // Debounced URL sync — don't write to URL on every frame
      if (moveDebounceRef.current) {
        clearTimeout(moveDebounceRef.current);
      }
      moveDebounceRef.current = setTimeout(() => {
        setMapCenterZoom(
          [evt.viewState.longitude, evt.viewState.latitude],
          evt.viewState.zoom
        );
      }, 750);
    },
    [setMapCenterZoom]
  );

  // Cleanup debounce timer
  useEffect(
    () => () => {
      if (moveDebounceRef.current) {
        clearTimeout(moveDebounceRef.current);
      }
    },
    []
  );

  return (
    <MapErrorBoundary resetKeys={[areaId]}>
      <div
        className="relative w-full h-full"
        style={MAP_CONTAINER_STYLE}
        role="region"
        aria-label="Interaktive Karte"
      >
        <MapRecoveryBoundary>
          <Map
            {...viewState}
            onMove={handleMove}
            mapStyle={currentMapStyle}
            style={MAP_STYLE}
            minZoom={3}
            maxZoom={18}
            canvasContextAttributes={{ preserveDrawingBuffer: true }}
          >
            <MapInner
              data={data}
              layerId={layerId}
              country={country}
              granularity={granularity}
              onGranularityChange={onGranularityChange}
              layers={layers}
              activeLayerId={activeLayerId}
              areaId={areaId}
              areaName={areaName}
              areaDescription={areaDescription}
              areaTags={areaTags}
              previewPostalCode={previewPostalCode}
              onSetPreviewPostalCode={onSetPreviewPostalCode}
              onZoomToLayer={onZoomToLayer}
              addPostalCodesToLayer={addPostalCodesToLayer}
              removePostalCodesFromLayer={removePostalCodesFromLayer}
              isViewingVersion={isViewingVersion}
              versionId={versionId}
              versions={versions}
              changes={changes}
              initialUndoRedoStatus={initialUndoRedoStatus}
              onCycleMapStyle={handleCycleMapStyle}
              mapStyleLabel={MAP_STYLES.find((s) => s.id === mapStyleId)?.label}
              mapStyles={MAP_STYLES}
              onSetMapStyle={(id) => {
                setMapStyleId(id as MapStyleId);
                localStorage.setItem("map-style-id", id);
              }}
              onSnapshotReady={onSnapshotReady}
            />
          </Map>
        </MapRecoveryBoundary>
      </div>
    </MapErrorBoundary>
  );
};

// Memoized export with display name for debugging
export const BaseMap = memo(BaseMapComponent);
BaseMap.displayName = "BaseMap";
