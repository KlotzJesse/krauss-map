"use client";

import type { InferSelectModel } from "drizzle-orm";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import {
  addPostalCodesToLayerAction,
  removePostalCodesFromLayerAction,
  radiusSearchAction,
  drivingRadiusSearchAction,
} from "@/app/actions/area-actions";
import { Button } from "@/components/ui/button";
import { useGeodata } from "@/lib/hooks/use-geodata";
import { usePostalCodeLookup } from "@/lib/hooks/use-postal-code-lookup";
import type {
  areaLayers,
  ChangeSummary,
  VersionSummary,
} from "@/lib/schema/schema";

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

import { FileUpIcon } from "lucide-react";
import dynamic from "next/dynamic";
import {
  useState,
  useTransition,
  useOptimistic,
  use,
  useCallback,
  useMemo,
} from "react";
import { toast } from "sonner";

import {
  AddressAutocompleteErrorBoundary,
  MapErrorBoundary,
} from "@/components/ui/error-boundaries";
import {
  AddressAutocompleteSkeleton,
  MapSkeleton,
} from "@/components/ui/loading-skeletons";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { createToastCallbacks } from "@/lib/utils/action-state-callbacks/toast-callbacks";
import { withCallbacks } from "@/lib/utils/action-state-callbacks/with-callbacks";
import { isLightColor } from "@/lib/utils/layer-colors";
import { getLargestPolygonCentroid } from "@/lib/utils/map-data";

const AddressAutocompleteEnhanced = dynamic(
  () =>
    import("./address-autocomplete-enhanced").then(
      (m) => m.AddressAutocompleteEnhanced
    ),

  {
    ssr: false,

    loading: () => <AddressAutocompleteSkeleton />,
  }
);

const PostalCodesMap = dynamic(
  () =>
    import("./postal-codes-map").then((m) => ({ default: m.PostalCodesMap })),

  {
    ssr: false,

    loading: () => <MapSkeleton />,
  }
);

import {
  useActiveLayerState,
  useSetMapCenterZoom,
} from "@/lib/url-state/map-state";

import { Badge } from "../ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

const PostalCodeImportDialog = dynamic(
  () =>
    import("./postal-code-import-dialog").then((m) => m.PostalCodeImportDialog),
  { ssr: false }
);

interface PostalCodesViewClientWithLayersProps {
  defaultGranularity: string;
  country?: import("@/lib/config/countries").CountryCode;
  areaId: number;
  areaNamePromise: Promise<string | null>;
  areaDescriptionPromise?: Promise<string | null>;
  areaTagsPromise?: Promise<{ id: number; name: string; color: string }[]>;
  layersPromise: Promise<Layer[]>;
  undoRedoStatusPromise: Promise<{
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  }>;
  versionsPromise: Promise<VersionSummary[]>;
  changesPromise: Promise<ChangeSummary[]>;
  isViewingVersion?: boolean;
  versionId?: number | null;
}

interface PostalCodesLayerActionsOptions {
  areaId: number;
  activeLayerId: number | null;
  data: FeatureCollection<Polygon | MultiPolygon>;
  initialLayers: Layer[];
  initialUndoRedoStatus: {
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  };
}

function usePostalCodesLayerActions({
  areaId,
  activeLayerId,
  data,
  initialLayers,
  initialUndoRedoStatus,
}: PostalCodesLayerActionsOptions) {
  const [_isPending, startTransition] = useTransition();

  const [optimisticLayers, updateOptimisticLayers] = useOptimistic(
    initialLayers,
    (
      currentLayers: Layer[],
      update: {
        type: "add" | "remove";
        layerId: number;
        postalCodes: string[];
      }
    ) =>
      currentLayers.map((layer) => {
        if (layer.id === update.layerId) {
          const currentCodes =
            layer.postalCodes?.map((pc) => pc.postalCode) || [];
          let newCodes: string[];
          if (update.type === "add") {
            newCodes = [...new Set([...currentCodes, ...update.postalCodes])];
          } else {
            const removeSet = new Set(update.postalCodes);
            newCodes = currentCodes.filter((code) => !removeSet.has(code));
          }
          return {
            ...layer,
            postalCodes: newCodes.map((code) => ({ postalCode: code })),
          };
        }
        return layer;
      })
  );

  const [optimisticUndoRedo, updateOptimisticUndoRedo] = useOptimistic(
    initialUndoRedoStatus,
    (current, _action: "increment") => ({
      ...current,
      undoCount: current.undoCount + 1,
      redoCount: 0,
      canUndo: true,
      canRedo: false,
    })
  );

  const { findPostalCodeByCoords } = usePostalCodeLookup({ data });

  const addPostalCodesToLayer = useStableCallback(
    async (layerId: number, postalCodes: string[]) => {
      if (!areaId) {
        toast.error("Kein Gebiet ausgewählt");
        return;
      }
      startTransition(async () => {
        updateOptimisticLayers({ type: "add", layerId, postalCodes });
        updateOptimisticUndoRedo("increment");
        try {
          const result = await addPostalCodesToLayerAction(
            areaId,
            layerId,
            postalCodes
          );
          if (!result.success) {
            toast.error(result.error);
          }
        } catch (error) {
          let message = "Fehler beim Hinzufügen der PLZ";
          if (error instanceof Error) {
            message = error.message;
          }
          toast.error(message);
        }
      });
    }
  );

  const removePostalCodesFromLayer = useStableCallback(
    async (layerId: number, postalCodes: string[]) => {
      if (!areaId) {
        toast.error("Kein Gebiet ausgewählt");
        return;
      }
      startTransition(async () => {
        updateOptimisticLayers({ type: "remove", layerId, postalCodes });
        updateOptimisticUndoRedo("increment");
        try {
          const result = await removePostalCodesFromLayerAction(
            areaId,
            layerId,
            postalCodes
          );
          if (!result.success) {
            toast.error(result.error);
          }
        } catch (error) {
          let message = "Fehler beim Entfernen der PLZ";
          if (error instanceof Error) {
            message = error.message;
          }
          toast.error(message);
        }
      });
    }
  );

  const performRadiusSearch = useStableCallback(
    async (searchData: {
      latitude: number;
      longitude: number;
      radius: number;
      granularity: string;
    }) => {
      const action = withCallbacks(
        () => radiusSearchAction(searchData),
        createToastCallbacks({
          loadingMessage: `Suche PLZ im Radius ${searchData.radius}km...`,
          successMessage: (data: unknown) => {
            const d = data as {
              success?: boolean;
              data?: { postalCodes?: string[] };
            };
            if (d.success && d.data) {
              const postalCodes = d.data.postalCodes;
              return `${postalCodes?.length ?? 0} PLZ gefunden und hinzugefügt`;
            }
            return "Erfolgreich durchgeführt";
          },
          errorMessage: "Radiussuche fehlgeschlagen",
        })
      );
      const result = await action();
      if (result?.success && result.data) {
        const postalCodes = result.data.postalCodes;
        if (activeLayerId && areaId) {
          addPostalCodesToLayer(activeLayerId, postalCodes);
        } else {
          toast.error("Bitte aktives Gebiet wählen");
        }
      }
    }
  );

  const performDrivingRadiusSearchWrapper = useStableCallback(
    async (
      coordinates: [number, number],
      radius: number,
      granularity: string
    ) => {
      const action = withCallbacks(
        () =>
          drivingRadiusSearchAction({
            latitude: coordinates[1],
            longitude: coordinates[0],
            maxDuration: radius,
            granularity,
          }),
        createToastCallbacks({
          loadingMessage: `Suche PLZ in ${radius}min Fahrzeit...`,
          successMessage: (data: unknown) => {
            const d = data as {
              success?: boolean;
              data?: { postalCodes?: string[] };
            };
            if (d.success && d.data) {
              const postalCodes = d.data.postalCodes;
              return `${postalCodes?.length ?? 0} PLZ gefunden und hinzugefügt`;
            }
            return "Erfolgreich durchgeführt";
          },
          errorMessage: "Fahrtzeitsuche fehlgeschlagen",
        })
      );
      const result = await action();
      if (result?.success && result.data) {
        const postalCodes = result.data.postalCodes;
        if (activeLayerId && areaId) {
          addPostalCodesToLayer(activeLayerId, postalCodes);
        } else {
          toast.error("Bitte aktives Gebiet wählen");
        }
      }
    }
  );

  const handleAddressSelect = useStableCallback(
    async (coords: [number, number], _label: string, postalCode?: string) => {
      const code = postalCode || findPostalCodeByCoords(coords[0], coords[1]);
      if (!code) {
        toast.error("Keine PLZ für Adresse gefunden");
        return;
      }
      if (activeLayerId && areaId) {
        await addPostalCodesToLayer(activeLayerId, [code]);
        toast.success(`PLZ ${code} hinzugefügt`);
      } else {
        toast.success(`PLZ ${code} gewählt`);
      }
    }
  );

  const handleRadiusSelect = useStableCallback(
    async (coords: [number, number], radius: number, granularity: string) => {
      await performRadiusSearch({
        latitude: coords[1],
        longitude: coords[0],
        radius,
        granularity,
      });
    }
  );

  const handleImport = useStableCallback(async (postalCodes: string[]) => {
    if (activeLayerId && areaId) {
      await addPostalCodesToLayer(activeLayerId, postalCodes);
      toast.success(`${postalCodes.length} PLZ hinzugefügt`);
    } else {
      toast.warning("Bitte aktives Gebiet wählen", {
        duration: 3000,
      });
    }
  });

  return {
    optimisticLayers,
    optimisticUndoRedo,
    addPostalCodesToLayer,
    removePostalCodesFromLayer,
    handleAddressSelect,
    handleRadiusSelect,
    handleImport,
    performDrivingRadiusSearchWrapper,
  };
}

export function PostalCodesViewClientWithLayers({
  defaultGranularity,
  country,
  areaNamePromise,
  areaDescriptionPromise,
  areaTagsPromise,
  areaId,
  layersPromise,
  undoRedoStatusPromise,
  versionsPromise,
  changesPromise,
  isViewingVersion = false,
  versionId,
}: PostalCodesViewClientWithLayersProps) {
  // Client Component: use() to consume server-provided promises
  const initialLayers = use(layersPromise);
  const initialUndoRedoStatus = use(undoRedoStatusPromise);
  const versions = use(versionsPromise);
  const changes = use(changesPromise);
  const areaName = use(areaNamePromise);
  const areaDescription = areaDescriptionPromise ? use(areaDescriptionPromise) : null;
  const areaTags = areaTagsPromise ? use(areaTagsPromise) : [];

  // Geodata fetched client-side to avoid 9.6MB RSC payload (TTFB: 1.3s → ~150ms)
  // "native" = all DACH countries at their full resolution
  const { data, isLoading: isGeodataLoading } = useGeodata("native");

  // Read activeLayerId directly from URL state for instant switching
  const { activeLayerId: urlActiveLayerId } = useActiveLayerState();
  const setMapCenterZoom = useSetMapCenterZoom();
  const activeLayerId = urlActiveLayerId || initialLayers[0]?.id || null;

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const openImportDialog = useCallback(() => setImportDialogOpen(true), []);
  const [previewPostalCode, setPreviewPostalCode] = useState<string | null>(
    null
  );

  const {
    optimisticLayers,
    optimisticUndoRedo,
    addPostalCodesToLayer,
    removePostalCodesFromLayer,
    handleAddressSelect,
    handleRadiusSelect,
    handleImport,
    performDrivingRadiusSearchWrapper,
  } = usePostalCodesLayerActions({
    areaId,
    activeLayerId,
    data,
    initialLayers,
    initialUndoRedoStatus,
  });

  const handlePreviewSelect = useCallback(
    (coords: [number, number] | null, _label: string, postalCode?: string) => {
      if (!postalCode) {
        return;
      }
      setPreviewPostalCode((prev) => (prev === postalCode ? null : postalCode));
      if (coords) {
        setMapCenterZoom([coords[0], coords[1]], 11);
      }
    },
    [setMapCenterZoom]
  );

  const handleBadgePreviewPostalCode = useCallback(
    (postalCode: string | null) => {
      setPreviewPostalCode(postalCode);
      if (postalCode && data) {
        const feature = data.features.find(
          (f) => f.properties?.code === postalCode
        );
        if (feature) {
          const [lng, lat] = getLargestPolygonCentroid(
            feature as import("geojson").Feature<Polygon | MultiPolygon>
          );
          setMapCenterZoom([lng, lat], 11);
        }
      }
    },
    [data, setMapCenterZoom]
  );

  const handleZoomToLayer = useCallback(
    (layerId: number) => {
      if (!data) return;
      const layer = optimisticLayers.find((l) => l.id === layerId);
      if (!layer?.postalCodes?.length) return;

      const codeSet = new Set(layer.postalCodes.map((pc) => pc.postalCode));
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      let found = false;

      for (const feature of data.features) {
        if (!codeSet.has(feature.properties?.code)) continue;
        found = true;
        const coords: number[][] = [];
        const geom = feature.geometry;
        if (geom.type === "Polygon") {
          for (const ring of geom.coordinates) for (const c of ring) coords.push(c);
        } else if (geom.type === "MultiPolygon") {
          for (const poly of geom.coordinates) for (const ring of poly) for (const c of ring) coords.push(c);
        }
        for (const [lng, lat] of coords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }

      if (!found) return;

      const centerLng = (minLng + maxLng) / 2;
      const centerLat = (minLat + maxLat) / 2;
      // Approximate zoom: wider bbox → lower zoom
      const lngSpan = maxLng - minLng;
      const latSpan = maxLat - minLat;
      const span = Math.max(lngSpan, latSpan);
      const zoom = Math.max(5, Math.min(13, Math.round(Math.log2(360 / span)) - 1));

      setMapCenterZoom([centerLng, centerLat], zoom);
    },
    [data, optimisticLayers, setMapCenterZoom]
  );

  const handleGranularityChange = useCallback(
    (newGranularity: string) => {
      if (newGranularity === defaultGranularity) {
        return;
      }

      // Granularity changes are now handled through the GranularitySelector component
      // which updates the area's granularity via server action and triggers a refresh

      toast.info("Granularität wird aktualisiert", {
        description: "Änderung wird gespeichert",

        duration: 3000,
      });
    },
    [defaultGranularity]
  );

  const activeLayer = useMemo(
    () => optimisticLayers.find((l) => l.id === activeLayerId),
    [optimisticLayers, activeLayerId]
  );

  // Per-layer duplicate postal code counts
  const duplicateCountByLayer = useMemo(() => {
    const counts = new Map<number, number>();
    const codeToLayers = new Map<string, number[]>();
    for (const layer of optimisticLayers) {
      if (!layer.postalCodes) continue;
      for (const pc of layer.postalCodes) {
        const existing = codeToLayers.get(pc.postalCode);
        if (existing) {
          existing.push(layer.id);
        } else {
          codeToLayers.set(pc.postalCode, [layer.id]);
        }
      }
    }
    for (const [, layerIds] of codeToLayers) {
      if (layerIds.length > 1) {
        for (const id of layerIds) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [optimisticLayers]);

  return (
    <div className="h-full relative">
      {/* Address and Postal Code Tools - horizontal, top right */}
      <div className="absolute top-4 right-4 z-30 flex flex-row items-center gap-2 w-auto">
        <div className="w-80">
          <AddressAutocompleteErrorBoundary>
            <AddressAutocompleteEnhanced
              onAddressSelect={handleAddressSelect}
              onBoundarySelect={handleImport}
              onRadiusSelect={handleRadiusSelect}
              onPreviewSelect={handlePreviewSelect}
              performDrivingRadiusSearch={performDrivingRadiusSearchWrapper}
              granularity={defaultGranularity}
              triggerClassName="truncate"
              previewPostalCode={previewPostalCode}
              layers={optimisticLayers}
            />
          </AddressAutocompleteErrorBoundary>
        </div>

        {/* Active layer indicator */}
        {activeLayer && (
          <div
            className="shrink-0 flex items-center px-2.5 py-1 rounded-md shadow-sm text-xs font-semibold select-none"
            style={{
              backgroundColor: activeLayer.color,
              color: isLightColor(activeLayer.color) ? "#1a1a1a" : "#fff",
            }}
          >
            <span className="truncate max-w-[140px]">{activeLayer.name}</span>
            <span className="ml-1.5 opacity-75">
              {activeLayer.postalCodes?.length ?? 0}
            </span>
          </div>
        )}

        {/* Import Button - Opens the import dialog */}
        <div className="shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  onClick={openImportDialog}
                  size="default"
                  className="shadow-sm bg-background"
                  title="PLZ importieren"
                  disabled={isGeodataLoading}
                />
              }
            >
              <FileUpIcon className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>
              <p>PLZ importieren</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Map with integrated tools */}
      <div className="relative h-full overflow-hidden">
        <MapErrorBoundary>
          <PostalCodesMap
            data={data}
            granularity={defaultGranularity}
            country={country}
            onGranularityChange={handleGranularityChange}
            layers={optimisticLayers}
            activeLayerId={activeLayerId}
            areaId={areaId}
            areaName={areaName ?? undefined}
            areaDescription={areaDescription}
            areaTags={areaTags}
            previewPostalCode={previewPostalCode}
            onSetPreviewPostalCode={handleBadgePreviewPostalCode}
            onZoomToLayer={handleZoomToLayer}
            addPostalCodesToLayer={addPostalCodesToLayer}
            removePostalCodesFromLayer={removePostalCodesFromLayer}
            isViewingVersion={isViewingVersion}
            versionId={versionId!}
            versions={versions}
            changes={changes}
            initialUndoRedoStatus={optimisticUndoRedo}
          />
        </MapErrorBoundary>
        {isGeodataLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/30 backdrop-blur-[1px] pointer-events-none">
            <div className="bg-background/80 rounded-lg px-4 py-2 text-sm text-muted-foreground shadow-sm">
              Geodaten werden geladen…
            </div>
          </div>
        )}
      </div>

      {/* Import Dialog */}
      <PostalCodeImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        data={data}
        granularity={defaultGranularity}
        onImport={handleImport}
        areaId={areaId}
      />
    </div>
  );
}
