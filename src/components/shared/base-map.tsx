"use no memo";
import { PlusIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, startTransition, Suspense, useRef, Activity } from "react";

import {
  DrawingToolsErrorBoundary,
  MapErrorBoundary,
} from "@/components/ui/error-boundaries";
import { DrawingToolsSkeleton } from "@/components/ui/loading-skeletons";
import { useMapCenterZoomSync } from "@/lib/hooks/use-map-center-zoom-sync";
import { useMapConfig } from "@/lib/hooks/use-map-config";
import { useMapInitialization } from "@/lib/hooks/use-map-initialization";
import { useMapInteractions } from "@/lib/hooks/use-map-interactions";
import { useMapLayers } from "@/lib/hooks/use-map-layers";
import { useMapOptimizations } from "@/lib/hooks/use-map-optimizations";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { useMapState } from "@/lib/url-state/map-state";
import type {
  BaseMapProps,
  MapErrorMessageProps,
  ToggleButtonProps,
} from "@/types/base-map";

import { Button } from "../ui/button";

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

// Main BaseMap component with performance optimizations
const BaseMapComponent = ({
  data,
  layerId,
  center = [10.4515, 51.1657],
  zoom = 5,
  statesData,
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
  // Stable ref for map container
  const mapContainer = useRef<HTMLDivElement>(null);

  // Stable map configuration using custom hook
  const mapConfig = useMapConfig(center, zoom);

  // Map initialization with stable config
  const { mapRef: map, isMapLoaded } = useMapInitialization({
    mapContainer,
    data,
    center: mapConfig.center,
    zoom: mapConfig.zoom,
    style: mapConfig.style,
  });

  // URL state management with stable destructuring
  const mapState = useMapState();
  const { setMapCenterZoom } = mapState;

  // Performance optimizations with memoized computations
  const optimizations = useMapOptimizations({
    data,
    statesData,
  });

  // Business logic with stable references (available for future use)

  // Memoized hovered region ref to prevent layer re-initialization

  // Map layers management with stable dependencies
  const { layersLoaded } = useMapLayers({
    mapRef: map,
    isMapLoaded,
    layerId,
    data,
    statesData,
    getSelectedFeatureCollection: optimizations.getSelectedFeatureCollection,
    getLabelPoints: optimizations.getLabelPoints,
    layers,
    activeLayerId,
  });

  // Map interactions with memoized callbacks
  const interactions = useMapInteractions({
    mapRef: map,
    layerId,
    data,
    isMapLoaded,
    layersLoaded,
    areaId,
    activeLayerId,
    layers,
    addPostalCodesToLayer,
    removePostalCodesFromLayer,
  });

  // Map center/zoom synchronization
  useMapCenterZoomSync({
    mapRef: map,
    isMapLoaded,
    center,
    zoom,
    setMapCenterZoom,
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

  return (
    <MapErrorBoundary>
      <div
        ref={mapContainer}
        className="w-full h-full min-h-[400px] rounded-lg"
        style={{ minHeight: mapConfig.minHeight }}
        role="region"
        aria-label="Interaktive Karte"
      />
      {/* Floating Drawing Toolbar - Center bottom */}
      <FloatingDrawingToolbar
        currentMode={interactions.currentDrawingMode}
        onModeChange={interactions.handleDrawingModeChange}
        areaId={areaId}
        initialUndoRedoStatus={initialUndoRedoStatus}
      />

      <Activity
        mode={interactions.isDrawingToolsVisible ? "visible" : "hidden"}
      >
        <div
          className="absolute top-4 left-4 z-10"
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
                onLayerSelect={(layerId: number) => {
                  console.log("Test");
                  mapState.setActiveLayer(layerId);
                }}
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
    </MapErrorBoundary>
  );
};

// Memoized export with display name for debugging
export const BaseMap = memo(BaseMapComponent);
BaseMap.displayName = "BaseMap";
