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
import { usePostalCodeLookup } from "@/lib/hooks/use-postal-code-lookup";
import { usePostalCodeSearch } from "@/lib/hooks/use-postal-code-search";
import type {
  areas,
  areaLayers,
  SelectAreaChanges,
  SelectAreaVersions,
} from "@/lib/schema/schema";

type Area = InferSelectModel<typeof areas>;

type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

import { FileUpIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useTransition, useOptimistic, use } from "react";
import { toast } from "sonner";

import {
  AddressAutocompleteErrorBoundary,
  MapErrorBoundary,
} from "@/components/ui/error-boundaries";
import {
  AddressAutocompleteSkeleton,
  MapSkeleton,
} from "@/components/ui/loading-skeletons";
import { createToastCallbacks } from "@/lib/utils/action-state-callbacks/toast-callbacks";
import { withCallbacks } from "@/lib/utils/action-state-callbacks/with-callbacks";

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

const PostalCodeImportDialog = dynamic(
  () =>
    import("./postal-code-import-dialog").then((m) => ({
      default: m.PostalCodeImportDialog,
    })),

  {
    ssr: false,
  }
);

import { useMapState } from "@/lib/url-state/map-state";

import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

interface PostalCodesViewClientWithLayersProps {
  postalCodesDataPromise: Promise<FeatureCollection<Polygon | MultiPolygon>>;
  statesDataPromise: Promise<FeatureCollection<Polygon | MultiPolygon>>;
  defaultGranularity: string;
  areaId: number;
  areasPromise: Promise<Area[]>;
  areaPromise: Promise<Area | null>;
  layersPromise: Promise<Layer[]>;
  undoRedoStatusPromise: Promise<{
    canUndo: boolean;
    canRedo: boolean;
    undoCount: number;
    redoCount: number;
  }>;
  versionsPromise: Promise<SelectAreaVersions[]>;
  changesPromise: Promise<SelectAreaChanges[]>;
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

  const { searchPostalCodes, selectPostalCode } = usePostalCodeSearch({ data });
  const { findPostalCodeByCoords } = usePostalCodeLookup({ data });

  const addPostalCodesToLayer = async (
    layerId: number,
    postalCodes: string[]
  ) => {
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
  };

  const removePostalCodesFromLayer = async (
    layerId: number,
    postalCodes: string[]
  ) => {
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
  };

  const performRadiusSearch = async (searchData: {
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
  };

  const performDrivingRadiusSearchWrapper = async (
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
  };

  const handleAddressSelect = async (
    coords: [number, number],
    _label: string,
    postalCode?: string
  ) => {
    const code = postalCode || findPostalCodeByCoords(coords[0], coords[1]);
    if (!code) {
      toast.error("Keine PLZ für Adresse gefunden");
      return;
    }
    if (activeLayerId && areaId) {
      await addPostalCodesToLayer(activeLayerId, [code]);
      toast.success(`PLZ ${code} hinzugefügt`);
    } else {
      selectPostalCode(code);
      toast.success(`PLZ ${code} gewählt`);
    }
  };

  const handleRadiusSelect = async (
    coords: [number, number],
    radius: number,
    granularity: string
  ) => {
    await performRadiusSearch({
      latitude: coords[1],
      longitude: coords[0],
      radius,
      granularity,
    });
  };

  const handleImport = async (postalCodes: string[]) => {
    if (activeLayerId && areaId) {
      await addPostalCodesToLayer(activeLayerId, postalCodes);
      toast.success(`${postalCodes.length} PLZ hinzugefügt`);
    } else {
      toast.warning("Bitte aktives Gebiet wählen", {
        duration: 3000,
      });
    }
  };

  return {
    optimisticLayers,
    optimisticUndoRedo,
    addPostalCodesToLayer,
    removePostalCodesFromLayer,
    searchPostalCodes,
    handleAddressSelect,
    handleRadiusSelect,
    handleImport,
    performDrivingRadiusSearchWrapper,
  };
}

export function PostalCodesViewClientWithLayers({
  postalCodesDataPromise,
  statesDataPromise,
  defaultGranularity,
  areaPromise,
  areaId,
  layersPromise,
  undoRedoStatusPromise,
  versionsPromise,
  changesPromise,
  isViewingVersion = false,
  versionId,
}: PostalCodesViewClientWithLayersProps) {
  // Client Component: use() to consume promises where data is actually used
  const initialData = use(postalCodesDataPromise);
  const statesData = use(statesDataPromise);
  const initialLayers = use(layersPromise);
  const initialUndoRedoStatus = use(undoRedoStatusPromise);
  const versions = use(versionsPromise);
  const changes = use(changesPromise);
  const area = use(areaPromise);

  // Read activeLayerId directly from URL state for instant switching
  const mapState = useMapState();
  const activeLayerId = mapState.activeLayerId || initialLayers[0]?.id || null;

  const [data] =
    useState<FeatureCollection<Polygon | MultiPolygon>>(initialData);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [previewPostalCode, setPreviewPostalCode] = useState<string | null>(
    null
  );

  const {
    optimisticLayers,
    optimisticUndoRedo,
    addPostalCodesToLayer,
    removePostalCodesFromLayer,
    searchPostalCodes,
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

  const handleGranularityChange = (newGranularity: string) => {
    if (newGranularity === defaultGranularity) {
      return;
    }

    // Granularity changes are now handled through the GranularitySelector component
    // which updates the area's granularity via server action and triggers a refresh

    toast.info("Granularität wird aktualisiert", {
      description: "Änderung wird gespeichert",

      duration: 3000,
    });
  };

  return (
    <div className="h-full relative">
      {/* Address and Postal Code Tools - horizontal, top right */}
      <div className="absolute top-4 right-4 z-30 flex flex-row gap-3 w-auto">
        <div className="w-80">
          <AddressAutocompleteErrorBoundary>
            <AddressAutocompleteEnhanced
              onAddressSelect={handleAddressSelect}
              onBoundarySelect={(codes) => handleImport(codes)}
              onRadiusSelect={handleRadiusSelect}
              onPreviewSelect={(coords, label, postalCode) => {
                if (postalCode) {
                  const isClosing = previewPostalCode === postalCode;
                  setPreviewPostalCode(isClosing ? null : postalCode);
                  if (!isClosing && coords) {
                    mapState.setMapCenterZoom([coords[0], coords[1]], 11);
                  }
                  searchPostalCodes(postalCode);
                }
              }}
              performDrivingRadiusSearch={performDrivingRadiusSearchWrapper}
              granularity={defaultGranularity}
              triggerClassName="truncate h-10"
              previewPostalCode={previewPostalCode}
              layers={optimisticLayers}
            />
          </AddressAutocompleteErrorBoundary>
        </div>

        {/* Postal Code Dropdown - Commented out as Umkreis search already handles this /* <Popover open={postalCodeOpen} onOpenChange={setPostalCodeOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="secondary"
              role="combobox"
              aria-expanded={postalCodeOpen}
              className="w-[100px] justify-between truncate"
            >
              <span className="truncate block w-full text-left">
                {selectedPostalCode ? selectedPostalCode : "PLZ"}
              </span>
              <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[100px] p-0">
            <Command>
              <CommandInput
                placeholder="PLZ"
                value={postalCodeQuery}
                onValueChange={(v) => {
                  setPostalCodeQuery(v);
                }}
                autoFocus
                autoComplete="off"
              />
              <CommandList>
                {allPostalCodes

                  .filter((code) =>
                    code.toLowerCase().includes(postalCodeQuery.toLowerCase()),
                  )

                  .slice(0, 10)

                  .map((code) => (
                    <CommandItem
                      key={code}
                      value={code}
                      onSelect={async () => {
                        if (activeLayerId && areaId) {
                          await addPostalCodesToLayer(activeLayerId, [code]);
                        } else {
                          selectPostalCode(code);
                        }

                        setSelectedPostalCode(code);

                        setPostalCodeQuery("");

                        setPostalCodeOpen(false);
                      }}
                      className="cursor-pointer truncate"
                    >
                        <span className="truncate block w-full text-left">
                          {code || "Unbekannt"}
                        </span>
                      </CommandItem>
                    ))}
                {allPostalCodes.filter((code) =>
                  code.toLowerCase().includes(postalCodeQuery.toLowerCase()),
                ).length === 0 && (
                  <CommandEmpty>Keine Ergebnisse</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover> */}

        {/* Import Button - Opens the import dialog */}
        <div className="shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="secondary"
                  onClick={() => setImportDialogOpen(true)}
                  size="default"
                  className="h-10 px-4"
                  title="PLZ importieren"
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
      <div className="h-full">
        <MapErrorBoundary>
          <PostalCodesMap
            data={data}
            statesData={statesData}
            onSearch={searchPostalCodes}
            granularity={defaultGranularity}
            onGranularityChange={handleGranularityChange}
            layers={optimisticLayers}
            activeLayerId={activeLayerId}
            areaId={areaId}
            areaName={area?.name}
            addPostalCodesToLayer={addPostalCodesToLayer}
            removePostalCodesFromLayer={removePostalCodesFromLayer}
            isViewingVersion={isViewingVersion}
            versionId={versionId!}
            versions={versions}
            changes={changes}
            initialUndoRedoStatus={optimisticUndoRedo}
          />
        </MapErrorBoundary>
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
