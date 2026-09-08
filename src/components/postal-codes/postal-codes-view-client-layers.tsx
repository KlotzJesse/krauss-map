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
} from "react";
import { toast } from "sonner";

import {
  addPostalCodesToLayerAction,
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
import type { Layer, LayerWire } from "@/lib/types/area-types";
import { createToastCallbacks } from "@/lib/utils/action-state-callbacks/toast-callbacks";
import { withCallbacks } from "@/lib/utils/action-state-callbacks/with-callbacks";
import {
  extractRawCode,
  storedCodeToCompositeKey,
} from "@/lib/utils/postal-code-keys";
import { isLightColor } from "@/lib/utils/layer-colors";
import { Kbd } from "@/components/ui/kbd";
import {
  useCommandPalette,
  usePublishMapMeta,
  useRegisterMapCommands,
} from "@/lib/context/command-palette-context";
import { useMountOnce } from "@/lib/hooks/use-mount-once";

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
  activeLayerId: number | null;
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
  activeLayerId,
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
              postalCodes,
              undefined,
              { skipInvalidate: true }
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
              postalCodes,
              undefined,
              { skipInvalidate: true }
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
          await addPostalCodesToLayer(activeLayerId, postalCodes);
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
          await addPostalCodesToLayer(activeLayerId, postalCodes);
        } else {
          toast.error("Bitte aktives Gebiet wählen");
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
    if (!(activeLayerId && areaId)) {
      toast.warning("Bitte aktives Gebiet wählen", {
        duration: 3000,
      });
      return false;
    }
    await addPostalCodesToLayer(activeLayerId, postalCodes);
    toast.success(`${postalCodes.length} PLZ hinzugefügt`);
    return true;
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

    // Codes, representative points, areas and bounds. The outlines arrive
    // separately as vector tiles, per visible tile rather than all at once.
    const {
      index,
      isLoading: isGeodataLoading,
      error: indexError,
    } = usePostalCodeIndex(defaultGranularity, areaCountries);

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
      granularity: defaultGranularity,
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

        let minLng = Infinity,
          maxLng = -Infinity,
          minLat = Infinity,
          maxLat = -Infinity;
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
          granularity: defaultGranularity,
          layers: optimisticLayers,
          activeLayerId,
        }),
        [areaId, areaName, defaultGranularity, optimisticLayers, activeLayerId]
      )
    );

    /**
     * A postal code typed into the palette resolves through the index, so the
     * centroid is exact and no geocoding round-trip is needed.
     */
    const centroidFor = useCallback(
      (code: string) =>
        indexCentroid(index, toCompositePostalCode(code, country)),
      [index, country]
    );

    const findPostalCode = useCallback(
      (code: string) => {
        const composite = toCompositePostalCode(code, country);
        const known = index.pos.has(composite);
        const containing = optimisticLayers.filter((layer) =>
          layer.postalCodes?.some(
            (pc) => toCompositePostalCode(pc.postalCode, country) === composite
          )
        );
        return {
          known,
          layers: containing.map((l) => ({
            id: l.id,
            name: l.name,
            color: l.color,
          })),
        };
      },
      [index, country, optimisticLayers]
    );

    useRegisterMapCommands({
      onAddPostalCode: async (code: string) => {
        if (!activeLayerId) {
          toast.error("Kein aktiver Layer ausgewählt");
          return;
        }
        await addPostalCodesToLayer(activeLayerId, [code]);
        toast.success(`PLZ ${code} hinzugefügt`);
      },
      onRemovePostalCode: async (code: string) => {
        if (!activeLayerId) {
          toast.error("Kein aktiver Layer ausgewählt");
          return;
        }
        await removePostalCodesFromLayer(activeLayerId, [code]);
        toast.success(`PLZ ${code} entfernt`);
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
      findPostalCode,
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
            granularity={defaultGranularity}
            onStraightRadius={handleRadiusSelect}
            performDrivingRadiusSearch={performDrivingRadiusSearchWrapper}
          />
        )}

        {/* Import Dialog */}
        <PostalCodeImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          availableCodes={index.keys}
          granularity={defaultGranularity}
          onImport={handleImport}
          areaId={areaId}
        />
      </div>
    );
  }
);

PostalCodesViewClientWithLayers.displayName = "PostalCodesViewClientWithLayers";
