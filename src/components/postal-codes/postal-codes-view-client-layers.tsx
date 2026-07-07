"use client";

import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { FileUpIcon } from "lucide-react";
import dynamic from "next/dynamic";
import {
  useState,
  useTransition,
  use,
  useCallback,
  useMemo,
  useRef,
  memo,
} from "react";
import { toast } from "sonner";

import {
  addPostalCodesToLayerAction,
  removePostalCodesFromLayerAction,
  radiusSearchAction,
  drivingRadiusSearchAction,
} from "@/app/actions/area-actions";
import { Button } from "@/components/ui/button";
import {
  AddressAutocompleteErrorBoundary,
  MapErrorBoundary,
} from "@/components/ui/error-boundaries";
import {
  AddressAutocompleteSkeleton,
  MapSkeleton,
} from "@/components/ui/loading-skeletons";
import { useGeodata } from "@/lib/hooks/use-geodata";
import { usePostalCodeLookup } from "@/lib/hooks/use-postal-code-lookup";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { ChangeSummary, VersionSummary } from "@/lib/schema/schema";
import type { Layer } from "@/lib/types/area-types";
import { createToastCallbacks } from "@/lib/utils/action-state-callbacks/toast-callbacks";
import { withCallbacks } from "@/lib/utils/action-state-callbacks/with-callbacks";
import { extractRawCode, storedCodeToCompositeKey } from "@/lib/utils/deck-gl-utils";
import { isLightColor } from "@/lib/utils/layer-colors";
import { getLargestPolygonCentroid } from "@/lib/utils/map-data";
import {
  detectCountryFromCode,
  type CountryCode,
} from "@/lib/config/countries";

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

const EMPTY_TAGS: { id: number; name: string; color: string }[] = [];

function toCompositePostalCode(
  postalCode: string,
  fallbackCountry?: CountryCode
): string {
  const detected = detectCountryFromCode(postalCode);
  const country = detected.country ?? fallbackCountry;
  const rawCode = extractRawCode(postalCode);
  return country ? `${country}:${rawCode}` : rawCode;
}

function arePostalCodesEquivalent(leftCode: string, rightCode: string): boolean {
  const leftComposite = storedCodeToCompositeKey(leftCode);
  const rightComposite = storedCodeToCompositeKey(rightCode);
  if (leftComposite && rightComposite) {
    return leftComposite === rightComposite;
  }
  if (!leftComposite && !rightComposite) {
    return extractRawCode(leftCode) === extractRawCode(rightCode);
  }
  return extractRawCode(leftCode) === extractRawCode(rightCode);
}

interface PostalCodesViewClientWithLayersProps {
  defaultGranularity: string;
  country?: import("@/lib/config/countries").CountryCode;
  areaCountriesPromise?: Promise<CountryCode[]>;
  areaId: number;
  areaMetaPromise: Promise<{
    name: string | null;
    granularity: string | null;
    country: string | null;
    description: string | null;
  }>;
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
  const restoreDroppedQueryParams = useStableCallback(
    (searchBeforeAction: string) => {
      if (!searchBeforeAction) {
        return;
      }
      queueMicrotask(() => {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.search === searchBeforeAction) {
          return;
        }
        currentUrl.search = searchBeforeAction;
        window.history.replaceState(
          window.history.state,
          "__nuqs__",
          currentUrl.toString()
        );
      });
    }
  );

  const [optimisticLayers, setOptimisticLayers] = useState(initialLayers);
  const [optimisticUndoRedo, setOptimisticUndoRedo] = useState(
    initialUndoRedoStatus
  );

  const applyLayerUpdate = useStableCallback(
    (
      currentLayers: Layer[],
      update: { type: "add" | "remove"; layerId: number; postalCodes: string[] }
    ) =>
      currentLayers.map((layer) => {
        if (layer.id !== update.layerId) {
          return layer;
        }

        const currentCodes =
          layer.postalCodes?.map((pc) => pc.postalCode) ?? [];

        if (update.type === "add") {
          const newCodes = [
            ...new Set([...currentCodes, ...update.postalCodes]),
          ];
          return {
            ...layer,
            postalCodes: newCodes.map((code) => ({ postalCode: code })),
          };
        }

        const newCodes = currentCodes.filter(
          (code) =>
            !update.postalCodes.some((removeCode) =>
              arePostalCodesEquivalent(code, removeCode)
            )
        );

        return {
          ...layer,
          postalCodes: newCodes.map((code) => ({ postalCode: code })),
        };
      })
  );

  const incrementUndoRedo = useStableCallback(
    (current: typeof initialUndoRedoStatus) => ({
      ...current,
      undoCount: current.undoCount + 1,
      redoCount: 0,
      canUndo: true,
      canRedo: false,
    })
  );

  type LayerMutationUpdate = {
    type: "add" | "remove";
    layerId: number;
    postalCodes: string[];
  };
  type PendingLayerMutation = { id: number; update: LayerMutationUpdate };

  const mutationIdRef = useRef(0);
  const pendingMutationsRef = useRef<PendingLayerMutation[]>([]);
  const committedLayersRef = useRef(initialLayers);
  const committedUndoRedoRef = useRef(initialUndoRedoStatus);

  const buildOptimisticUndoRedo = useStableCallback(
    (
      committed: typeof initialUndoRedoStatus,
      pendingMutationsCount: number
    ) => {
      const undoCount = committed.undoCount + pendingMutationsCount;
      return {
        ...committed,
        undoCount,
        redoCount: 0,
        canUndo: undoCount > 0,
        canRedo: false,
      };
    }
  );

  const recomputeOptimisticState = useStableCallback(() => {
    let nextLayers = committedLayersRef.current;
    for (const mutation of pendingMutationsRef.current) {
      nextLayers = applyLayerUpdate(nextLayers, mutation.update);
    }
    setOptimisticLayers(nextLayers);
    setOptimisticUndoRedo(
      buildOptimisticUndoRedo(
        committedUndoRedoRef.current,
        pendingMutationsRef.current.length
      )
    );
  });

  // Stable refs so callbacks that only read (not depend on) these values
  // don't recreate on every render and break React.memo on children.
  const optimisticLayersRef = useRef(optimisticLayers);
  optimisticLayersRef.current = optimisticLayers;
  const dataRef = useRef(data);
  dataRef.current = data;

  const { findPostalCodeByCoords } = usePostalCodeLookup({ data });

  const addPostalCodesToLayer = useStableCallback(
    async (layerId: number, postalCodes: string[]) => {
      if (!areaId) {
        toast.error("Kein Gebiet ausgewählt");
        return;
      }
      const searchBeforeAction = window.location.search;
      const update: LayerMutationUpdate = { type: "add", layerId, postalCodes };
      const mutationId = ++mutationIdRef.current;
      pendingMutationsRef.current = [
        ...pendingMutationsRef.current,
        { id: mutationId, update },
      ];
      // URGENT: update map immediately — outside startTransition so React
      // treats this as high-priority and renders before the server round-trip.
      setOptimisticLayers((current) => applyLayerUpdate(current, update));
      setOptimisticUndoRedo(
        buildOptimisticUndoRedo(
          committedUndoRedoRef.current,
          pendingMutationsRef.current.length
        )
      );
      // NON-URGENT: persist to server in background
      startTransition(async () => {
        try {
          const result = await addPostalCodesToLayerAction(
            areaId,
            layerId,
            postalCodes,
            undefined,
            { skipInvalidate: true }
          );
          if (!result.success) {
            pendingMutationsRef.current = pendingMutationsRef.current.filter(
              (mutation) => mutation.id !== mutationId
            );
            recomputeOptimisticState();
            toast.error(result.error);
            return;
          }
          committedLayersRef.current = applyLayerUpdate(
            committedLayersRef.current,
            update
          );
          committedUndoRedoRef.current = incrementUndoRedo(
            committedUndoRedoRef.current
          );
          pendingMutationsRef.current = pendingMutationsRef.current.filter(
            (mutation) => mutation.id !== mutationId
          );
          recomputeOptimisticState();
          restoreDroppedQueryParams(searchBeforeAction);
        } catch (error) {
          pendingMutationsRef.current = pendingMutationsRef.current.filter(
            (mutation) => mutation.id !== mutationId
          );
          recomputeOptimisticState();
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
      const searchBeforeAction = window.location.search;
      const update: LayerMutationUpdate = {
        type: "remove",
        layerId,
        postalCodes,
      };
      const mutationId = ++mutationIdRef.current;
      pendingMutationsRef.current = [
        ...pendingMutationsRef.current,
        { id: mutationId, update },
      ];
      // URGENT: update map immediately — outside startTransition
      setOptimisticLayers((current) => applyLayerUpdate(current, update));
      setOptimisticUndoRedo(
        buildOptimisticUndoRedo(
          committedUndoRedoRef.current,
          pendingMutationsRef.current.length
        )
      );
      // NON-URGENT: persist to server in background
      startTransition(async () => {
        try {
          const result = await removePostalCodesFromLayerAction(
            areaId,
            layerId,
            postalCodes,
            undefined,
            { skipInvalidate: true }
          );
          if (!result.success) {
            pendingMutationsRef.current = pendingMutationsRef.current.filter(
              (mutation) => mutation.id !== mutationId
            );
            recomputeOptimisticState();
            toast.error(result.error);
            return;
          }
          committedLayersRef.current = applyLayerUpdate(
            committedLayersRef.current,
            update
          );
          committedUndoRedoRef.current = incrementUndoRedo(
            committedUndoRedoRef.current
          );
          pendingMutationsRef.current = pendingMutationsRef.current.filter(
            (mutation) => mutation.id !== mutationId
          );
          recomputeOptimisticState();
          restoreDroppedQueryParams(searchBeforeAction);
        } catch (error) {
          pendingMutationsRef.current = pendingMutationsRef.current.filter(
            (mutation) => mutation.id !== mutationId
          );
          recomputeOptimisticState();
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
      // Prefer map-derived code (includes country prefix on multi-country datasets).
      const code = findPostalCodeByCoords(coords[0], coords[1]) ?? postalCode;
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
    optimisticLayersRef,
    optimisticUndoRedo,
    addPostalCodesToLayer,
    removePostalCodesFromLayer,
    handleAddressSelect,
    handleRadiusSelect,
    handleImport,
    performDrivingRadiusSearchWrapper,
  };
}

export const PostalCodesViewClientWithLayers = memo(
  function PostalCodesViewClientWithLayers({
    defaultGranularity,
    country,
    areaCountriesPromise,
    areaMetaPromise,
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
    const areaMeta = use(areaMetaPromise);
    const areaCountriesFromServer: CountryCode[] = areaCountriesPromise
      ? use(areaCountriesPromise)
      : [];
    const areaName = areaMeta.name;
    const areaDescription = areaMeta.description;
    const areaTags = areaTagsPromise ? use(areaTagsPromise) : EMPTY_TAGS;

    // Load only the active area's country/granularity dataset by default.
    // If the area contains prefixed cross-country postal codes, include those countries too.
    const areaCountries = useMemo(() => {
      const countrySet = new Set<CountryCode>();
      for (const areaCountry of areaCountriesFromServer) {
        countrySet.add(areaCountry);
      }
      if (country) {
        countrySet.add(country);
      }
      for (const layer of initialLayers) {
        for (const postalCodeEntry of layer.postalCodes ?? []) {
          const detected = detectCountryFromCode(postalCodeEntry.postalCode).country;
          if (detected) {
            countrySet.add(detected);
          }
        }
      }
      return [...countrySet];
    }, [areaCountriesFromServer, country, initialLayers]);

    const { data, isLoading: isGeodataLoading } = useGeodata(
      defaultGranularity,
      areaCountries
    );

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
      optimisticLayersRef,
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

    // Stable ref for geodata so handleZoomToLayer doesn't recreate on every data change
    const dataRef = useRef(data);
    dataRef.current = data;

    const handlePreviewSelect = useCallback(
      (
        coords: [number, number] | null,
        _label: string,
        postalCode?: string
      ) => {
        if (!postalCode) {
          return;
        }
        setPreviewPostalCode((prev) =>
          prev === postalCode ? null : postalCode
        );
        if (coords) {
          setMapCenterZoom([coords[0], coords[1]], 11);
        }
      },
      [setMapCenterZoom]
    );

    const handleBadgePreviewPostalCode = useStableCallback(
      (postalCode: string | null) => {
        setPreviewPostalCode(postalCode);
        if (postalCode && data) {
          const targetCode = toCompositePostalCode(postalCode, country);
          const feature = data.features.find(
            (f) => {
              const rawCode = String(f.properties?.code ?? "");
              if (!rawCode) return false;
              const featureCountry = String(f.properties?.country ?? "");
              const featureCode = featureCountry
                ? `${featureCountry}:${rawCode}`
                : rawCode;
              return featureCode === targetCode;
            }
          );
          if (feature) {
            const [lng, lat] = getLargestPolygonCentroid(
              feature as import("geojson").Feature<Polygon | MultiPolygon>
            );
            setMapCenterZoom([lng, lat], 11);
          }
        }
      }
    );

    const handleZoomToLayer = useCallback(
      (layerId: number) => {
        const data = dataRef.current;
        if (!data) return;
        const layer = optimisticLayersRef.current.find((l) => l.id === layerId);
        if (!layer?.postalCodes?.length) return;

        const codeSet = new Set(
          layer.postalCodes.map((pc) =>
            toCompositePostalCode(pc.postalCode, country)
          )
        );
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
          if (!codeSet.has(featureCode)) continue;
          found = true;
          const coords: number[][] = [];
          const geom = feature.geometry;
          if (geom.type === "Polygon") {
            for (const ring of geom.coordinates)
              for (const c of ring) coords.push(c);
          } else if (geom.type === "MultiPolygon") {
            for (const poly of geom.coordinates)
              for (const ring of poly) for (const c of ring) coords.push(c);
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
        const zoom = Math.max(
          5,
          Math.min(13, Math.round(Math.log2(360 / span)) - 1)
        );

        setMapCenterZoom([centerLng, centerLat], zoom);
      },
      [country, setMapCenterZoom]
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

    return (
      <div className="h-full relative">
        {/* Address and Postal Code Tools - horizontal, top right */}
        <div className="absolute top-4 right-16 z-30 flex flex-row items-center gap-2 w-auto">
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
              className="shrink-0 flex items-center px-2.5 h-8 rounded-md shadow-sm text-xs font-semibold select-none"
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
                    size="icon"
                    className="shadow-sm bg-background h-8 w-8"
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
              countries={areaCountries}
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
);

PostalCodesViewClientWithLayers.displayName = "PostalCodesViewClientWithLayers";
