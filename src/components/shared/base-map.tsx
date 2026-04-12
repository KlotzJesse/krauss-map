"use no memo";
import { PlusIcon } from "lucide-react";
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

import "maplibre-gl/dist/maplibre-gl.css";
import {
  DrawingToolsErrorBoundary,
  MapErrorBoundary,
} from "@/components/ui/error-boundaries";
import { DrawingToolsSkeleton } from "@/components/ui/loading-skeletons";
import { useDeckLayers } from "@/lib/hooks/use-deck-layers";
import { useMapInteractions } from "@/lib/hooks/use-map-interactions";
import { useMapLabels } from "@/lib/hooks/use-map-labels";
import { useMapOptimizations } from "@/lib/hooks/use-map-optimizations";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { useStatesData } from "@/lib/hooks/use-states-data";
import {
  useActiveLayerState,
  useSetMapCenterZoom,
} from "@/lib/url-state/map-state";
import type {
  BaseMapProps,
  MapErrorMessageProps,
  ToggleButtonProps,
} from "@/types/base-map";

import { Button } from "../ui/button";
import { DeckGLOverlay } from "./deck-gl-overlay";

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

/**
 * Inner map component — must be a child of <Map> to use useMap() hook.
 * Manages TerraDraw integration via raw MapLibre instance and labels via hybrid approach.
 */
const MapInner = memo(function MapInner({
  data,
  layerId,
  granularity,
  onGranularityChange,
  layers,
  activeLayerId,
  areaId,
  areaName,
  previewPostalCode,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
  isViewingVersion,
  versionId,
  versions,
  changes,
  initialUndoRedoStatus,
}: Omit<BaseMapProps, "center" | "zoom">) {
  const { current: mapRef } = useMap();
  const rawMapRef = useRef<maplibregl.Map | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

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

    const handleLoad = () => setIsMapLoaded(true);

    if (raw.loaded()) {
      setIsMapLoaded(true);
    } else {
      raw.once("load", handleLoad);
    }

    return () => {
      raw.off("load", handleLoad);
      setIsMapLoaded(false);
    };
  }, [mapRef]);

  // URL state management (narrow: only layer switching, not view state)
  const { setActiveLayer, isLayerPending } = useActiveLayerState();

  // States data fetched client-side to avoid 246KB RSC payload bloat
  const statesData = useStatesData();

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
  });

  // deck.gl layers (polygons, fills, hover, preview)
  const { deckLayers, onHover, cursor } = useDeckLayers({
    data,
    statesData,
    layers,
    activeLayerId,
    previewPostalCode,
    featureIndex: optimizations.featureIndex,
    isCursorMode: interactions.isCursorMode,
  });

  // Sync cursor state from deck.gl hover to map canvas
  useEffect(() => {
    const map = mapRef?.getMap();
    if (map) {
      map.getCanvas().style.cursor = cursor;
    }
  }, [mapRef, cursor]);

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
  });

  // Memoized toggle handlers with React 19 batching optimization
  const handleShowTools = useStableCallback(() => {
    startTransition(() => {
      interactions.showTools();
    });
  });

  const handleHideTools = useStableCallback(() => {
    startTransition(() => {
      interactions.hideTools();
    });
  });

  const handleClearAll = useStableCallback(() => {
    startTransition(() => {
      interactions.clearAll();
    });
  });

  const handleDeleteEditingFeature = useStableCallback(() => {
    startTransition(() => {
      interactions.deleteEditingFeature();
    });
  });

  const handleDeselectEditingFeature = useStableCallback(() => {
    startTransition(() => {
      interactions.deselectEditingFeature();
    });
  });

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
                activeLayerId={activeLayerId}
                onLayerSelect={setActiveLayer}
                isLayerSwitchPending={isLayerPending}
                addPostalCodesToLayer={addPostalCodesToLayer}
                removePostalCodesFromLayer={removePostalCodesFromLayer}
                layers={layers}
                isViewingVersion={isViewingVersion}
                versionId={versionId}
                versions={versions}
                changes={changes}
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
    </>
  );
});
MapInner.displayName = "MapInner";

// Main BaseMap component with react-map-gl + deck.gl
const BaseMapComponent = ({
  data,
  layerId,
  center = [10.4515, 51.1657],
  zoom = 5,
  granularity,
  onGranularityChange,
  layers,
  activeLayerId,
  areaId,
  areaName,
  previewPostalCode,
  addPostalCodesToLayer,
  removePostalCodesFromLayer,
  isViewingVersion = false,
  versionId,
  versions,
  changes,
  initialUndoRedoStatus,
}: BaseMapProps) => {
  // Controlled view state for URL sync (narrow: only setter, no view subscription)
  const setMapCenterZoom = useSetMapCenterZoom();
  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [viewState, setViewState] = useState({
    longitude: center[0],
    latitude: center[1],
    zoom,
  });

  // Sync from URL changes (back/forward, saved views)
  useEffect(() => {
    setViewState((prev) => ({
      ...prev,
      longitude: center[0],
      latitude: center[1],
      zoom,
    }));
  }, [center, zoom]);

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
      }, 500);
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
        style={{ minHeight: "400px" }}
        role="region"
        aria-label="Interaktive Karte"
      >
        <MapRecoveryBoundary>
          <Map
            {...viewState}
            onMove={handleMove}
            mapStyle="/versatilescolorful.json"
            style={{ width: "100%", height: "100%" }}
            minZoom={3}
            maxZoom={18}
          >
            <MapInner
              data={data}
              layerId={layerId}
              granularity={granularity}
              onGranularityChange={onGranularityChange}
              layers={layers}
              activeLayerId={activeLayerId}
              areaId={areaId}
              areaName={areaName}
              previewPostalCode={previewPostalCode}
              addPostalCodesToLayer={addPostalCodesToLayer}
              removePostalCodesFromLayer={removePostalCodesFromLayer}
              isViewingVersion={isViewingVersion}
              versionId={versionId}
              versions={versions}
              changes={changes}
              initialUndoRedoStatus={initialUndoRedoStatus}
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
