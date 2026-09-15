"use client";

import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  useEffect,
} from "react";
import { toast } from "sonner";

import {
  getAreaLayerStateAction,
  getUndoRedoStatusAction,
} from "@/app/actions/layer-actions";
import {
  addPostalCodesToLayerAction,
  createLayerAction,
  removePostalCodesFromLayerAction,
  radiusSearchAction,
  drivingRadiusSearchAction,
} from "@/app/actions/area-actions";
import { Button } from "@/components/ui/button";
import { MapErrorBoundary } from "@/components/ui/error-boundaries";
import {
  MapSkeleton,
} from "@/components/ui/loading-skeletons";
import {
  detectCountryFromCode,
  type CountryCode,
} from "@/lib/config/countries";
import {
  indexBounds,
  indexCentroid,
  usePostalCodeIndex,
} from "@/lib/hooks/use-postal-code-index";
import { usePostalCodeLookup } from "@/lib/hooks/use-postal-code-lookup";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { ChangeSummary, VersionSummary } from "@/lib/schema/schema";
import {
  reduceLayerChange,
  type Layer,
  type LayerChange,
  type LayerWire,
} from "@/lib/types/area-types";
import { createToastCallbacks } from "@/lib/utils/action-state-callbacks/toast-callbacks";
import { withCallbacks } from "@/lib/utils/action-state-callbacks/with-callbacks";
import {
  compositeKeyToStoredCode,
  extractRawCode,
  resolveTypedPostalCodes,
  storedCodeToCompositeKey,
} from "@/lib/utils/postal-code-keys";
import { generateNextColor, isLightColor } from "@/lib/utils/layer-colors";
import { Kbd } from "@/components/ui/kbd";
import {
  useCommandPalette,
  usePublishMapMeta,
  useRegisterMapCommands,
} from "@/lib/context/command-palette-context";
import { useMountOnce } from "@/lib/hooks/use-mount-once";
import {
  notifyAreasChanged,
  onAreasRefreshed,
} from "@/lib/sync/sidebar-data";

const RadiusSearchDialog = dynamic(
  () =>
    import("./radius-search-dialog").then((m) => ({
      default: m.RadiusSearchDialog,
    })),
  { ssr: false }
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

function arePostalCodesEquivalent(
  leftCode: string,
  rightCode: string
): boolean {
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
  country?: CountryCode;
  areaCountriesPromise?: Promise<CountryCode[]>;
  areaId: number;
  areaMetaPromise: Promise<{
    name: string | null;
    granularity: string | null;
    country: string | null;
    description: string | null;
  }>;
  areaTagsPromise?: Promise<{ id: number; name: string; color: string }[]>;
  layersPromise: Promise<LayerWire[]>;
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
  /** The layer the URL asks for; may no longer exist (see activeLayerId). */
  requestedActiveLayerId: number | null;
  granularity: string;
  countries: CountryCode[];
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
  requestedActiveLayerId,
  granularity,
  countries,
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

  // The active layer, resolved against the layers that actually exist. The URL
  // keeps whatever id was last selected; after a delete, merge, split or version
  // restore that id can be gone, and resolving it blindly left the area with no
  // active layer — every "add to active layer" command then silently did
  // nothing. Fall back to the first layer, as a fresh load does.
  const activeLayerId =
    requestedActiveLayerId !== null &&
    optimisticLayers.some((layer) => layer.id === requestedActiveLayerId)
      ? requestedActiveLayerId
      : (optimisticLayers[0]?.id ?? null);

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
      // With nothing in flight the server's numbers are the truth. Overriding
      // them here left the redo button greyed out after an undo, because a new
      // mutation clears the redo stack and this assumed every update was one.
      if (pendingMutationsCount === 0) {
        return committed;
      }
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
  const { findPostalCodeByCoords } = usePostalCodeLookup({
    granularity,
    countries,
  });

  const addPostalCodesToLayer = useStableCallback(
    async (layerId: number, postalCodes: string[]) => {
      if (!areaId) {
        toast.error("Kein Gebiet ausgewählt");
        throw new Error("Kein Gebiet ausgewählt");
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
      // NON-URGENT: persist to server in background; resolve only on confirmed completion
      await new Promise<void>((resolve, reject) => {
        startTransition(async () => {
          try {
            const result = await addPostalCodesToLayerAction(
              areaId,
              layerId,
              postalCodes
            );
            if (!result.success) {
              pendingMutationsRef.current = pendingMutationsRef.current.filter(
                (mutation) => mutation.id !== mutationId
              );
              recomputeOptimisticState();
              const message = result.error ?? "Fehler beim Hinzufügen der PLZ";
              toast.error(message);
              reject(new Error(message));
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
            // Code counts in the sidebar.
            notifyAreasChanged();
            resolve();
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
            reject(new Error(message));
          }
        });
      });
    }
  );

  const removePostalCodesFromLayer = useStableCallback(
    async (layerId: number, postalCodes: string[]) => {
      if (!areaId) {
        toast.error("Kein Gebiet ausgewählt");
        throw new Error("Kein Gebiet ausgewählt");
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
      // NON-URGENT: persist to server in background; resolve only on confirmed completion
      await new Promise<void>((resolve, reject) => {
        startTransition(async () => {
          try {
            const result = await removePostalCodesFromLayerAction(
              areaId,
              layerId,
              postalCodes
            );
            if (!result.success) {
              pendingMutationsRef.current = pendingMutationsRef.current.filter(
                (mutation) => mutation.id !== mutationId
              );
              recomputeOptimisticState();
              const message = result.error ?? "Fehler beim Entfernen der PLZ";
              toast.error(message);
              reject(new Error(message));
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
            // Code counts in the sidebar.
            notifyAreasChanged();
            resolve();
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
            reject(new Error(message));
          }
        });
      });
    }
  );

  /**
   * Apply a layer change the caller already knows the outcome of.
   *
   * Panels call this after the server confirms a create/update/delete instead
   * of keeping their own list. It lands in the committed list, so it survives
   * the next postal-code edit — a second copy did not, which is how a freshly
   * created layer used to vanish from the panel on the very next action.
   */
  const applyLayerChange = useStableCallback((change: LayerChange) => {
    committedLayersRef.current = reduceLayerChange(
      committedLayersRef.current,
      change
    );
    recomputeOptimisticState();
    notifyAreasChanged();
  });

  /**
   * Re-read layers and undo/redo counters from the server.
   *
   * For the mutations whose result the client cannot work out for itself: undo,
   * redo, version restore, bulk import, merge, split, granularity change. One
   * round trip, and no route re-render, so the map is never torn down.
   */
  const resyncLayers = useStableCallback(async () => {
    if (!areaId) {
      return;
    }
    const result = await getAreaLayerStateAction(areaId);
    if (!result.success) {
      return;
    }
    committedLayersRef.current = result.data.layers.map(
      ({ codes, ...layer }) => ({
        ...layer,
        postalCodes: codes.map((postalCode) => ({ postalCode })),
      })
    );
    committedUndoRedoRef.current = result.data.undoRedo;
    // A resync is the authoritative answer, so anything still queued locally is
    // either already reflected in it or was rolled back on the server.
    pendingMutationsRef.current = [];
    recomputeOptimisticState();
    notifyAreasChanged();
  });

  const createFirstLayer = useStableCallback(async (targetAreaId: number) => {
    const existing = optimisticLayersRef.current;
    const result = await createLayerAction(targetAreaId, {
      name: `Gebiet ${existing.length + 1}`,
      color: generateNextColor(existing.map((layer) => layer.color)),
      opacity: 70,
      isVisible: true,
      orderIndex: existing.length,
    });
    if (!(result.success && result.data)) {
      toast.error("Gebiet konnte nicht angelegt werden");
      return null;
    }
    const { codes, ...layer } = result.data;
    applyLayerChange({
      type: "create",
      layer: {
        ...layer,
        postalCodes: codes.map((postalCode) => ({ postalCode })),
      } as Layer,
    });
    return layer.id;
  });

  /**
   * The layer new codes should go into, creating the area's first layer if it
   * has none. A fresh area starts empty, and adding a code there used to end in
   * "Kein aktiver Layer ausgewählt" even though the palette had just offered to
   * add it. The new layer becomes active on its own: with nothing else in the
   * list, activeLayerId resolves to it.
   */
  const creatingFirstLayerRef = useRef<Promise<number | null> | null>(null);
  const resolveTargetLayerId = useStableCallback(async () => {
    if (activeLayerId) {
      return activeLayerId;
    }
    if (!areaId) {
      toast.error("Kein Gebiet ausgewählt");
      return null;
    }
    // Two quick adds on an empty area both see "no layer" before the first one
    // re-renders; share the one creation instead of making two layers.
    if (creatingFirstLayerRef.current) {
      return await creatingFirstLayerRef.current;
    }
    const creation = createFirstLayer(areaId);
    creatingFirstLayerRef.current = creation;
    let result;
    try {
      result = await creation;
    } finally {
      creatingFirstLayerRef.current = null;
    }
    return result;
  });


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
        const targetLayerId = await resolveTargetLayerId();
        if (targetLayerId) {
          await addPostalCodesToLayer(targetLayerId, postalCodes);
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
        const targetLayerId = await resolveTargetLayerId();
        if (targetLayerId) {
          await addPostalCodesToLayer(targetLayerId, postalCodes);
        }
      }
    }
  );

  const handleAddressSelect = useStableCallback(
    async (coords: [number, number], _label: string, postalCode?: string) => {
      // Prefer map-derived code (includes country prefix on multi-country datasets).
      const code =
        (await findPostalCodeByCoords(coords[0], coords[1])) ?? postalCode;
      if (!code) {
        toast.error("Keine PLZ für Adresse gefunden");
        return;
      }
      const targetLayerId = await resolveTargetLayerId();
      if (targetLayerId) {
        await addPostalCodesToLayer(targetLayerId, [code]);
        toast.success(`PLZ ${code} hinzugefügt`);
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
    const targetLayerId = await resolveTargetLayerId();
    if (!targetLayerId) {
      return false;
    }
    await addPostalCodesToLayer(targetLayerId, postalCodes);
    toast.success(`${postalCodes.length} PLZ hinzugefügt`);
    return true;
  });


  /** Re-read only the undo/redo counters; see getUndoRedoStatusAction. */
  const refreshUndoRedo = useStableCallback(async () => {
    if (!areaId || pendingMutationsRef.current.length > 0) {
      return;
    }
    const result = await getUndoRedoStatusAction(areaId);
    // An edit that started while this was in flight owns the counters now.
    if (!result.success || pendingMutationsRef.current.length > 0) {
      return;
    }
    committedUndoRedoRef.current = result.data;
    recomputeOptimisticState();
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
    applyLayerChange,
    resyncLayers,
    activeLayerId,
    resolveTargetLayerId,
    refreshUndoRedo,
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
    const layersWire = use(layersPromise);
    // Rehydrate the compact wire format (see LayerWire) back into the
    // `{ postalCode }[]` shape the rest of the tree expects.
    const initialLayers = useMemo<Layer[]>(
      () =>
        layersWire.map(({ codes, ...layer }) => ({
          ...layer,
          postalCodes: codes.map((postalCode) => ({ postalCode })),
        })),
      [layersWire]
    );
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
          const detected = detectCountryFromCode(
            postalCodeEntry.postalCode
          ).country;
          if (detected) {
            countrySet.add(detected);
          }
        }
      }
      return [...countrySet];
    }, [areaCountriesFromServer, country, initialLayers]);

    // The area's granularity as last confirmed on this page. It starts as the
    // server's value and is overridden once the user changes it, so the switch
    // happens in place: the index, the tile source and the layers follow this
    // value instead of waiting for a route re-render that would remount the map.
    // Keyed by area so navigating to another area drops the override.
    const [granularityOverride, setGranularityOverride] = useState<{
      areaId: number | null | undefined;
      granularity: string;
    } | null>(null);
    const granularity =
      granularityOverride && granularityOverride.areaId === areaId
        ? granularityOverride.granularity
        : defaultGranularity;

    // Codes, representative points, areas and bounds. The outlines arrive
    // separately as vector tiles, per visible tile rather than all at once.
    const {
      index,
      isLoading: isGeodataLoading,
      error: indexError,
    } = usePostalCodeIndex(granularity, areaCountries);

    // Read activeLayerId directly from URL state for instant switching
    const { activeLayerId: urlActiveLayerId } = useActiveLayerState();
    const setMapCenterZoom = useSetMapCenterZoom();

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
      applyLayerChange,
      resyncLayers,
      activeLayerId,
      resolveTargetLayerId,
      refreshUndoRedo,
    } = usePostalCodesLayerActions({
      areaId,
      requestedActiveLayerId: urlActiveLayerId ?? null,
      granularity,
      countries: areaCountries,
      initialLayers,
      initialUndoRedoStatus,
    });

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
        if (postalCode) {
          const centroid = indexCentroid(
            index,
            toCompositePostalCode(postalCode, country)
          );
          if (centroid) {
            setMapCenterZoom(centroid, 11);
          }
        }
      }
    );

    /**
     * Fit the viewport to one layer. Bounds come from the postal-code index —
     * a lookup per assigned code, rather than a pass over every vertex of the
     * country to find the few that belong to this layer.
     */
    const handleZoomToLayer = useCallback(
      (layerId: number) => {
        const layer = optimisticLayersRef.current.find((l) => l.id === layerId);
        if (!layer?.postalCodes?.length) return;

        let minLng = Infinity;
          let maxLng = -Infinity;
          let minLat = Infinity;
          let maxLat = -Infinity;
        let found = false;

        for (const pc of layer.postalCodes) {
          const bounds = indexBounds(
            index,
            toCompositePostalCode(pc.postalCode, country)
          );
          if (!bounds) continue;
          found = true;
          if (bounds[0] < minLng) minLng = bounds[0];
          if (bounds[1] < minLat) minLat = bounds[1];
          if (bounds[2] > maxLng) maxLng = bounds[2];
          if (bounds[3] > maxLat) maxLat = bounds[3];
        }

        if (!found) return;

        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;
        // Approximate zoom: wider bbox → lower zoom
        const span = Math.max(maxLng - minLng, maxLat - minLat);
        const zoom = Math.max(
          5,
          Math.min(13, Math.round(Math.log2(360 / span)) - 1)
        );

        setMapCenterZoom([centerLng, centerLat], zoom);
      },
      [country, index, setMapCenterZoom]
    );

    // Any edit in the app — including ones made outside the map, like renaming
    // the area in the sidebar — refreshes the live sidebar data. Follow it with
    // the undo/redo counters, since those edits are undoable from here too.
    useEffect(
      () => onAreasRefreshed(() => void refreshUndoRedo()),
      [refreshUndoRedo]
    );

    const handleGranularityChange = useCallback(
      (newGranularity: string) => {
        if (newGranularity === granularity) {
          return;
        }
        // The selector has already saved the change. Switching the value here
        // reloads the index and tile source for the new granularity, and the
        // resync picks up the codes the server migrated, all without touching
        // the route — so the map stays mounted.
        setGranularityOverride({ areaId, granularity: newGranularity });
        void resyncLayers();
      },
      [granularity, areaId, resyncLayers]
    );

    const activeLayer = useMemo(
      () => optimisticLayers.find((l) => l.id === activeLayerId),
      [optimisticLayers, activeLayerId]
    );

    // ⌘K is the only search surface; the field in the header opens it.
    const { setOpen: setPaletteOpen } = useCommandPalette();
    const paletteShortcut =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
        ? "⌘K"
        : "Strg K";

    const [radiusDialog, setRadiusDialog] = useState<{
      open: boolean;
      coords: [number, number] | null;
    }>({ open: false, coords: null });
    const mountRadiusDialog = useMountOnce(radiusDialog.open);

    const openRadiusSearch = useCallback((coords?: [number, number]) => {
      if (!coords) {
        // Without a point there is nothing to search around; the palette's
        // per-result "Umkreis um …" entries always pass one.
        toast.info(
          "Suchen Sie zuerst eine Adresse oder einen Ort, um den Umkreis zu setzen"
        );
        return;
      }
      setRadiusDialog({ open: true, coords });
    }, []);

    usePublishMapMeta(
      useMemo(
        () => ({
          areaId,
          areaName: areaName ?? "Gebiet",
          granularity,
          layers: optimisticLayers,
          activeLayerId,
        }),
        [areaId, areaName, granularity, optimisticLayers, activeLayerId]
      )
    );

    /**
     * A postal code typed into the palette resolves through the index, so the
     * centroid is exact and no geocoding round-trip is needed.
     */


    // Every code on the map in stored form, for resolving what was typed.
    const storedIndexCodes = useMemo(
      () => new Set(index.keys.map((key) => compositeKeyToStoredCode(key))),
      [index]
    );
    const resolvePostalCode = useCallback(
      (code: string) =>
        resolveTypedPostalCodes([code], storedIndexCodes, country ?? "DE")[0] ??
        null,
      [storedIndexCodes, country]
    );
    const centroidFor = useCallback(
      (code: string) =>
        indexCentroid(
          index,
          toCompositePostalCode(resolvePostalCode(code) ?? code, country)
        ),
      [index, country, resolvePostalCode]
    );

    useRegisterMapCommands({
      onAddPostalCode: async (typed: string) => {
        // Stored form, so a bare "1010" typed in a German area goes in as the
        // Austrian code that exists, not as a made-up "D-01010".
        const code = resolvePostalCode(typed);
        if (!code) {
          toast.error(`PLZ ${typed} gibt es in diesem Datensatz nicht`);
          return;
        }
        const targetLayerId = await resolveTargetLayerId();
        if (!targetLayerId) {
          return;
        }
        await addPostalCodesToLayer(targetLayerId, [code]);
        toast.success(`PLZ ${code} hinzugefügt`);
      },
      onRemovePostalCode: async (typed: string) => {
        const code = resolvePostalCode(typed) ?? typed;
        // Remove it from whichever layers hold it, not from the active one.
        // The palette offers "entfernen" when the code is anywhere in the area,
        // so targeting the active layer reported success and removed nothing
        // whenever the code lived somewhere else.
        const holders = optimisticLayersRef.current.filter((layer) =>
          layer.postalCodes?.some((entry) =>
            arePostalCodesEquivalent(entry.postalCode, code)
          )
        );
        if (holders.length === 0) {
          toast.error(`PLZ ${code} ist keinem Gebiet zugeordnet`);
          return;
        }
        for (const layer of holders) {
          await removePostalCodesFromLayer(layer.id, [code]);
        }
        const where =
          holders.length === 1
            ? `aus ${holders[0].name}`
            : `aus ${holders.length} Gebieten`;
        toast.success(`PLZ ${code} ${where} entfernt`);
      },
      onPreviewPostalCode: (code: string) => {
        setPreviewPostalCode((prev) => (prev === code ? null : code));
        const centroid = centroidFor(code);
        if (centroid) {
          setMapCenterZoom(centroid, 11);
        }
      },
      onZoomToPostalCode: (code: string) => {
        const centroid = centroidFor(code);
        if (centroid) {
          setMapCenterZoom(centroid, 11);
        }
      },
      onRadiusAroundPostalCode: (code: string) => {
        const centroid = centroidFor(code);
        if (!centroid) {
          toast.error(`PLZ ${code} nicht gefunden`);
          return;
        }
        setRadiusDialog({ open: true, coords: centroid });
      },
      resolvePostalCode,
      onAddressSelect: handleAddressSelect,
      onPreviewSelect: handlePreviewSelect,
      onBoundarySelect: async (postalCodes: string[]) => {
        await handleImport(postalCodes);
      },
      onOpenRadiusSearch: openRadiusSearch,
      onOpenImport: openImportDialog,
      onZoomToLayer: handleZoomToLayer,
    });

    return (
      <div className="h-full relative">
        {/* Address and Postal Code Tools - horizontal, top right */}
        <div className="absolute top-4 right-4 z-30 flex flex-row items-center gap-2 w-auto">
          <div className="w-80">
            {/* The search itself lives in the command palette now — this is the
                same control it always was, but it opens ⌘K rather than a second
                search of its own. */}
            <Button
              variant="outline"
              className="h-8 w-full justify-start gap-0 bg-background font-normal shadow-sm truncate"
              onClick={() => setPaletteOpen(true)}
              aria-label="PLZ, Adresse, Stadt oder Region suchen"
            >
              <HugeiconsIcon
                icon={SearchIcon}
                strokeWidth={2}
                className="size-3.5 shrink-0 opacity-50"
              />
              <span className="ml-[6px] text-muted-foreground truncate">
                PLZ, Adresse, Stadt oder Region suchen...
              </span>
              <Kbd className="ml-auto hidden shrink-0 sm:inline-flex">
                {paletteShortcut}
              </Kbd>
            </Button>
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
                    aria-label="PLZ importieren"
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
              index={index}
              granularity={granularity}
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
              onLayerChange={applyLayerChange}
              onResyncLayers={resyncLayers}
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
          {indexError && !isGeodataLoading && (
            <div className="absolute top-4 left-4 z-30 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive max-w-md">
              Geodaten konnten nicht geladen werden: {indexError}
            </div>
          )}
        </div>

        {mountRadiusDialog && (
          <RadiusSearchDialog
            open={radiusDialog.open}
            onOpenChange={(open) =>
              setRadiusDialog((prev) => ({ ...prev, open }))
            }
            coords={radiusDialog.coords}
            granularity={granularity}
            onStraightRadius={handleRadiusSelect}
            performDrivingRadiusSearch={performDrivingRadiusSearchWrapper}
          />
        )}

        {/* Import Dialog */}
        <PostalCodeImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          availableCodes={index.keys}
          granularity={granularity}
          onImport={handleImport}
          onLayersChanged={resyncLayers}
          areaId={areaId}
        />
      </div>
    );
  }
);

PostalCodesViewClientWithLayers.displayName = "PostalCodesViewClientWithLayers";
