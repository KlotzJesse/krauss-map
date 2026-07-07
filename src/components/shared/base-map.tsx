import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  Camera,
  ChevronDown,
  Ellipsis,
  Home,
  Layers,
  LocateFixed,
  Maximize2,
  Printer,
  PanelLeftOpen,
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
} from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Map, useMap, type MapRef } from "react-map-gl/maplibre";

import "maplibre-gl/dist/maplibre-gl.css";
import { Activity } from "@/components/ui/activity";
import {
  DrawingToolsErrorBoundary,
  MapErrorBoundary,
} from "@/components/ui/error-boundaries";
import { DrawingToolsSkeleton } from "@/components/ui/loading-skeletons";
import { useSidebar } from "@/components/ui/sidebar";
import {
  COUNTRY_CONFIGS,
  DACH_CENTER,
  DACH_ZOOM,
  detectCountryFromCode,
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
  useMapView,
  useSetMapCenterZoom,
} from "@/lib/url-state/map-state";
import { cn } from "@/lib/utils";
import { resolveFeatureKey } from "@/lib/utils/deck-gl-utils";
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
  DropdownMenuSeparator,
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

function toCompositePostalCode(
  postalCode: string,
  fallbackCountry?: string
): string {
  const detected = detectCountryFromCode(postalCode);
  const normalizedCountry = detected.country ?? fallbackCountry;
  const rawCode = detected.code;
  return normalizedCountry ? `${normalizedCountry}:${rawCode}` : rawCode;
}

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
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className="flex items-center justify-center w-8 h-8 rounded-md bg-background/90 border border-border shadow-sm hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
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
    <div className="absolute bottom-22.5 right-2.5 z-10 print:hidden">
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-md overflow-hidden max-w-[200px]">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/50 transition-colors"
        >
          <span>Legende</span>
          <ChevronDown
            className={`h-3 w-3 text-muted-foreground transition-transform ${collapsed ? "rotate-180" : "rotate-0"}`}
          />
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
      const key = resolveFeatureKey(code, country, featureIndex);
      const features = featureIndex?.get(key) ?? featureIndex?.get(code);
      if (!features || features.length === 0) return;
      let minLng = Infinity,
        maxLng = -Infinity,
        minLat = Infinity,
        maxLat = -Infinity;
      let found = false;
      for (const ft of features) {
        const geom = ft.geometry;
        const rings: number[][][] =
          geom.type === "Polygon"
            ? geom.coordinates
            : geom.type === "MultiPolygon"
              ? geom.coordinates.flat()
              : [];
        for (const ring of rings) {
          for (const c of ring) {
            found = true;
            if (c[0] < minLng) minLng = c[0];
            if (c[0] > maxLng) maxLng = c[0];
            if (c[1] < minLat) minLat = c[1];
            if (c[1] > maxLat) maxLat = c[1];
          }
        }
      }
      if (!found) return;
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
    <div className="absolute top-4 right-4 z-40 print:hidden">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          title="PLZ suchen und anspringen"
          aria-label="PLZ suchen"
          className="flex items-center justify-center w-8 h-8 rounded-md bg-background/90 border border-border shadow-sm hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
      ) : (
        <form
          onSubmit={handleSearch}
          className="flex items-center gap-1 bg-background/95 border border-border rounded-lg shadow-md px-2 h-6"
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
  countries,
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
  const rightPanActiveRef = useRef(false);
  const rightPanLastPointRef = useRef<[number, number] | null>(null);
  const isMapInteractingRef = useRef(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const setMapCenterZoom = useSetMapCenterZoom();
  const [isGeolocating, setIsGeolocating] = useState(false);
  const { toggleSidebar } = useSidebar();

  const handleRecenter = useCallback(() => {
    const config = country ? COUNTRY_CONFIGS[country] : undefined;
    const center = config?.center ?? ([10.4515, 51.1657] as [number, number]);
    const zoom = config?.zoom ?? 5;
    setMapCenterZoom(center, zoom);
    rawMapRef.current?.flyTo({ center, zoom });
  }, [country, setMapCenterZoom]);

  const handleBookmarkJump = useCallback(
    (center: [number, number], zoom: number) => {
      setMapCenterZoom(center, zoom);
      rawMapRef.current?.flyTo({ center, zoom });
    },
    [setMapCenterZoom]
  );

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const center: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude,
        ];
        setMapCenterZoom(center, 13);
        rawMapRef.current?.flyTo({ center, zoom: 13 });
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

  // Enable right-button drag panning while rotation is disabled.
  useEffect(() => {
    const map = rawMapRef.current;
    const canvas = mapCanvasRef.current;
    if (!isMapLoaded || !map || !canvas) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) {
        return;
      }
      event.preventDefault();
      rightPanActiveRef.current = true;
      rightPanLastPointRef.current = [event.clientX, event.clientY];
      canvas.style.cursor = "grabbing";
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!rightPanActiveRef.current || !rightPanLastPointRef.current) {
        return;
      }
      event.preventDefault();
      const [lastX, lastY] = rightPanLastPointRef.current;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (dx !== 0 || dy !== 0) {
        map.panBy([-dx, -dy], { animate: false });
        rightPanLastPointRef.current = [event.clientX, event.clientY];
      }
    };

    const stopRightPan = () => {
      if (!rightPanActiveRef.current) {
        return;
      }
      rightPanActiveRef.current = false;
      rightPanLastPointRef.current = null;
      canvas.style.cursor = "grab";
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopRightPan);
    window.addEventListener("blur", stopRightPan);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopRightPan);
      window.removeEventListener("blur", stopRightPan);
    };
  }, [isMapLoaded]);

  // URL state management (narrow: only layer switching, not view state)
  const { setActiveLayer, isLayerPending } = useActiveLayerState();

  // Load only countries that are actually referenced by area layers (usually one country).
  const { data: statesData, error: statesDataError } = useStatesData(
    countries ?? country
  );
  const { data: countryShapesData, error: countryShapesError } =
    useCountryShapesData(countries ?? country);
  const mapDataError = statesDataError ?? countryShapesError;

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

  // deck.gl layers (polygons, fills, preview) — hover pushed directly to overlay, no React re-render
  const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const { deckLayers, onHover, clearHover, unassignedCount } = useDeckLayers({
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
    hoverTooltipRef,
    overlayRef,
    isMapInteractingRef,
  });

  // Track map interaction state for hover suppression during pan/zoom.
  // Placed after useDeckLayers so clearHover is available.
  const clearHoverRef = useRef(clearHover);
  clearHoverRef.current = clearHover;
  useEffect(() => {
    const map = rawMapRef.current;
    if (!isMapLoaded || !map) return;
    const onStart = () => {
      isMapInteractingRef.current = true;
      clearHoverRef.current();
    };
    const onEnd = () => {
      isMapInteractingRef.current = false;
    };
    map.on("movestart", onStart);
    map.on("moveend", onEnd);
    return () => {
      map.off("movestart", onStart);
      map.off("moveend", onEnd);
    };
  }, [isMapLoaded]);

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
      layers.flatMap((l) =>
        (l.postalCodes ?? []).map((pc) =>
          toCompositePostalCode(pc.postalCode, country)
        )
      )
    );
    if (allCodes.size === 0) return;

    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;
    let found = false;

    for (const feature of data.features) {
      const rawCode = String(feature.properties?.code ?? "");
      if (!rawCode) continue;
      const featureCountry = String(feature.properties?.country ?? "");
      const featureCode = featureCountry
        ? `${featureCountry}:${rawCode}`
        : rawCode;
      if (!allCodes.has(featureCode)) continue;
      if (!feature.geometry || !feature.geometry.type) continue;
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
    const center: [number, number] = [centerLng, centerLat];
    setMapCenterZoom(center, zoom);
    rawMapRef.current?.flyTo({ center, zoom });
  }, [data, layers, country, setMapCenterZoom]);

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

  // When a drawing tool is active, let TerraDraw own the cursor.
  // deck.gl's default getCursor forces "grab"/"grabbing" on the container,
  // overriding the canvas cursor TerraDraw sets.
  const isCursorModeRef = useRef(interactions.isCursorMode);
  isCursorModeRef.current = interactions.isCursorMode;
  const getDeckCursor = useCallback(
    ({ isDragging }: { isDragging: boolean }) => {
      if (!isCursorModeRef.current) return "unset";
      return isDragging ? "grabbing" : "grab";
    },
    []
  );

  return (
    <>
      <DeckGLOverlay
        layers={deckLayers}
        onHover={onHover}
        onClick={interactions.handleDeckClick}
        overlayRef={overlayRef}
        getCursor={getDeckCursor}
      />

      {/* Floating Drawing Toolbar - Center bottom */}
      <FloatingDrawingToolbar
        currentMode={interactions.currentDrawingMode}
        onModeChange={interactions.handleDrawingModeChange}
        areaId={areaId}
        isPanelOpen={interactions.isDrawingToolsVisible}
        undoRedoStatus={initialUndoRedoStatus}
      />
      {/* Edit bar - appears above the toolbar when a drawn shape is selected */}
      {interactions.editingFeatureId && (
        <FloatingDrawingEditBar
          onDelete={handleDeleteEditingFeature}
          onDismiss={handleDeselectEditingFeature}
        />
      )}

      {/* Left panel area: DrawingTools card + toolbar sit in a flex row so buttons are always flush */}
      <div className="absolute top-4 left-4 bottom-4 z-10 flex items-start gap-0 print:hidden">
        {/* DrawingTools panel or collapse button */}
        <Activity
          mode={interactions.isDrawingToolsVisible ? "visible" : "hidden"}
        >
          <div
            className="flex flex-col h-full"
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
          <div role="region" aria-label="Kartentools-Panel">
            <ToggleButton
              onClick={handleShowTools}
              title="Kartentools anzeigen"
              ariaLabel="Kartentools-Panel anzeigen"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </ToggleButton>
          </div>
        </Activity>

        {/* Map toolbar — flush right of card/collapse button */}
        <div className="flex flex-col gap-1 ml-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title="Weitere Kartenaktionen"
                aria-label="Weitere Kartenaktionen"
                className="flex items-center justify-center w-8 h-8 rounded-md bg-background/90 border border-border shadow-sm hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
              />
            }
          >
            <Ellipsis className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="min-w-44">
            <DropdownMenuItem
              onClick={handleScreenshot}
              className="text-xs gap-2"
            >
              <Camera className="h-3.5 w-3.5" />
              Karte als PNG speichern
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handlePrint} className="text-xs gap-2">
              <Printer className="h-3.5 w-3.5" />
              Karte drucken
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleGeolocate}
              disabled={isGeolocating}
              className="text-xs gap-2"
            >
              <LocateFixed
                className={`h-3.5 w-3.5 ${isGeolocating ? "animate-pulse" : ""}`}
              />
              Meinen Standort anzeigen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {layers?.some((l) => (l.postalCodes?.length ?? 0) > 0) && (
          <button
            type="button"
            onClick={handleFitAllLayers}
            title="Alle Ebenen anzeigen (G)"
            aria-label="Karte auf alle Ebenen ausrichten (G)"
            className="flex items-center justify-center w-8 h-8 rounded-md bg-background/90 border border-border shadow-sm hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleRecenter}
          title="Zur Länderübersicht"
          aria-label="Zur Länderübersicht zoomen"
          className="flex items-center justify-center w-8 h-8 rounded-md bg-background/90 border border-border shadow-sm hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
        >
          <Home className="h-4 w-4" />
        </button>
        {onCycleMapStyle && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title={`Kartenstil: ${mapStyleLabel ?? ""}`}
                  aria-label="Kartenstil wählen"
                  className="flex items-center justify-center w-8 h-8 rounded-md bg-background/90 border border-border shadow-sm hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
                />
              }
            >
              <Layers className="h-4 w-4" />
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
            "relative flex items-center justify-center w-8 h-8 rounded-md border shadow-sm transition-colors",
            showUnassigned
              ? "bg-red-500/10 border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-500/20"
              : unassignedCount > 0
                ? "bg-orange-500/10 border-orange-400/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20"
                : "bg-background/90 border-border text-muted-foreground hover:bg-background hover:text-foreground"
          )}
        >
          {showUnassigned ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {unassignedCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-orange-500 text-white text-[9px] font-bold leading-4 text-center tabular-nums">
              {unassignedCount > 9999
                ? `${Math.round(unassignedCount / 1000)}k`
                : unassignedCount.toLocaleString("de-DE")}
            </span>
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
      </div>

      {/* PLZ search overlay — top right */}
      <PlzSearch
        data={data}
        featureIndex={optimizations.featureIndex}
        country={country}
      />

      {mapDataError && (
        <div className="absolute top-12 right-4 z-30 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive max-w-sm">
          Karten-Overlay konnte nicht vollständig geladen werden: {mapDataError}
        </div>
      )}

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

      {/* Hover tooltip — always rendered, shown/hidden via direct DOM (no React re-render on hover) */}
      <div
        ref={hoverTooltipRef}
        className="absolute z-20 pointer-events-none"
        style={{ display: "none", left: 0, top: 0 }}
      >
        <div className="bg-popover/95 border border-border rounded shadow-md px-2 py-1.5 text-xs min-w-[80px]">
          <div
            data-tooltip-code
            className="font-mono font-semibold text-foreground"
          />
          <div data-tooltip-layers className="mt-1 space-y-0.5" />
        </div>
      </div>

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
  countries,
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
  // Read map view from URL for back/forward navigation sync — only inside BaseMapComponent
  // so outer components (PostalCodesMap, etc.) don't subscribe to URL changes
  const [{ center: urlCenter, zoom: urlZoom }] = useMapView();
  const effectiveCenter =
    center ?? urlCenter ?? countryConfig?.center ?? DACH_CENTER;
  const effectiveZoom = zoom ?? urlZoom ?? countryConfig?.zoom ?? DACH_ZOOM;
  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleSetMapStyle = useCallback((id: string) => {
    setMapStyleId(id as MapStyleId);
    localStorage.setItem("map-style-id", id);
  }, []);

  const mapExternalRef = useRef<MapRef>(null);
  // Track URL positions we wrote ourselves so the sync effect can ignore them
  const lastDebouncePositionRef = useRef<[number, number, number] | null>(null);
  const hasMountedRef = useRef(false);

  // Handle map movement — bypass nuqs entirely to avoid React re-renders.
  // nuqs uses startTransition internally which cascades through the layout tree
  // (Router → NuqsAdapter → SidebarProvider → NavAreas → 31×AreaListItem → Tooltip/MenuRoot).
  // Raw history.replaceState writes the URL correctly for page reload/share without any re-renders.
  const handleMove = useCallback(
    (evt: {
      viewState: { longitude: number; latitude: number; zoom: number };
    }) => {
      const { longitude, latitude, zoom } = evt.viewState;
      if (moveDebounceRef.current) {
        clearTimeout(moveDebounceRef.current);
      }
      moveDebounceRef.current = setTimeout(() => {
        lastDebouncePositionRef.current = [longitude, latitude, zoom];
        const url = new URL(window.location.href);
        url.searchParams.set(
          "mapView",
          JSON.stringify({ center: [longitude, latitude], zoom })
        );
        // "__nuqs__" marker bypasses nuqs history patch — prevents all nuqs hooks from
        // re-rendering on every debounced pan write. Next.js also skips ACTION_RESTORE.
        window.history.replaceState(
          window.history.state,
          "__nuqs__",
          url.toString()
        );
      }, 750);
    },
    []
  );

  // Sync from external URL changes (back/forward, zoom-to-layer, etc.)
  // Skip if the URL change came from our own debounced panning write.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    const last = lastDebouncePositionRef.current;
    const isOwnWrite =
      last !== null &&
      Math.abs(last[0] - effectiveCenter[0]) < 0.0001 &&
      Math.abs(last[1] - effectiveCenter[1]) < 0.0001 &&
      Math.abs(last[2] - effectiveZoom) < 0.01;
    if (!isOwnWrite) {
      mapExternalRef.current?.flyTo({
        center: [effectiveCenter[0], effectiveCenter[1]],
        zoom: effectiveZoom,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveCenter[0], effectiveCenter[1], effectiveZoom]);

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
            ref={mapExternalRef}
            initialViewState={{
              longitude: effectiveCenter[0],
              latitude: effectiveCenter[1],
              zoom: effectiveZoom,
            }}
            onMove={handleMove}
            mapStyle={currentMapStyle}
            style={MAP_STYLE}
            dragRotate={false}
            fadeDuration={0}
            onContextMenu={(event) => event.preventDefault()}
            minZoom={3}
            maxZoom={18}
          >
            <MapInner
              data={data}
              layerId={layerId}
              country={country}
              granularity={granularity}
              onGranularityChange={onGranularityChange}
              countries={countries}
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
              onSetMapStyle={handleSetMapStyle}
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
