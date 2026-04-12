import {
  ChevronsUpDownIcon,
  MapPinIcon,
  RadiusIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { useRef, useReducer, useOptimistic, memo } from "react";
import { toast } from "sonner";

import {
  geocodeSearchAction,
  searchPostalCodesByBoundaryAction,
} from "@/app/actions/area-actions";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

const EMPTY_ARRAY: never[] = [];

interface GeocodeResult {
  id: number | string;
  display_name: string;
  coordinates: [number, number];
  postal_code?: string;
  city?: string;
  state?: string;
  country?: string;
  isLocationBased?: boolean; // Flag for results from location search
}

interface AutocompleteState {
  open: boolean;
  query: string;
  results: GeocodeResult[];
  isLoading: boolean;
  radiusDialogOpen: boolean;
  selectedCoords: [number, number] | null;
  radius: number;
  customRadiusInput: string;
  searchMode: "straight" | "distance" | "time";
}

type AutocompleteAction =
  | { type: "SET_OPEN"; open: boolean }
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_RESULTS"; results: GeocodeResult[] }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "OPEN_RADIUS"; coords: [number, number] }
  | { type: "CLOSE_RADIUS" }
  | { type: "SET_RADIUS"; radius: number }
  | { type: "SET_RADIUS_INPUT"; input: string }
  | { type: "SET_SEARCH_MODE"; mode: "straight" | "distance" | "time" };

const initialAutocompleteState: AutocompleteState = {
  open: false,
  query: "",
  results: [],
  isLoading: false,
  radiusDialogOpen: false,
  selectedCoords: null,
  radius: 5,
  customRadiusInput: "5",
  searchMode: "distance",
};

function autocompleteReducer(
  state: AutocompleteState,
  action: AutocompleteAction
): AutocompleteState {
  switch (action.type) {
    case "SET_OPEN": {
      return { ...state, open: action.open };
    }
    case "SET_QUERY": {
      return { ...state, query: action.query };
    }
    case "SET_RESULTS": {
      return { ...state, results: action.results };
    }
    case "SET_LOADING": {
      return { ...state, isLoading: action.isLoading };
    }
    case "OPEN_RADIUS": {
      return {
        ...state,
        radiusDialogOpen: true,
        selectedCoords: action.coords,
        open: false,
      };
    }
    case "CLOSE_RADIUS": {
      return { ...state, radiusDialogOpen: false, selectedCoords: null };
    }
    case "SET_RADIUS": {
      return { ...state, radius: action.radius };
    }
    case "SET_RADIUS_INPUT": {
      return { ...state, customRadiusInput: action.input };
    }
    case "SET_SEARCH_MODE": {
      return { ...state, searchMode: action.mode };
    }
  }
}

interface AddressAutocompleteEnhancedProps {
  onAddressSelect: (
    coords: [number, number],
    label: string,
    postalCode?: string
  ) => void;
  onBoundarySelect?: (postalCodes: string[]) => void; // For selecting all postal codes in an administrative area
  onRadiusSelect: (
    coords: [number, number],
    radius: number,
    granularity: string
  ) => void;
  onPreviewSelect?: (
    coords: [number, number],
    label: string,
    postalCode?: string
  ) => void; // For previewing/highlighting a postal code without adding it
  performDrivingRadiusSearch?: (
    coordinates: [number, number],
    radius: number,
    granularity: string,
    mode: "distance" | "time",
    method: "osrm" | "approximation"
  ) => Promise<unknown>;
  granularity: string;
  triggerClassName?: string;
  previewPostalCode?: string | null; // Currently previewed postal code
  layers?: {
    id: number;
    name: string;
    color: string;
    postalCodes?: { postalCode: string }[];
  }[]; // Available layers to check postal code membership
}

interface UseAddressAutocompleteOptions {
  onAddressSelect: (
    coords: [number, number],
    label: string,
    postalCode?: string
  ) => void;
  onBoundarySelect?: (postalCodes: string[]) => void;
  onRadiusSelect: (
    coords: [number, number],
    radius: number,
    granularity: string
  ) => void;
  performDrivingRadiusSearch?: (
    coordinates: [number, number],
    radius: number,
    granularity: string,
    mode: "distance" | "time",
    method: "osrm" | "approximation"
  ) => Promise<unknown>;
  granularity: string;
  layers: {
    id: number;
    name: string;
    color: string;
    postalCodes?: { postalCode: string }[];
  }[];
}

function useAddressAutocomplete({
  onAddressSelect,
  onBoundarySelect,
  onRadiusSelect,
  performDrivingRadiusSearch,
  granularity,
  layers,
}: UseAddressAutocompleteOptions) {
  const [state, dispatch] = useReducer(
    autocompleteReducer,
    initialAutocompleteState
  );
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [_optimisticSearching, _updateOptimisticSearching] = useOptimistic(
    false,
    (_state, searching: boolean) => searching
  );

  const syncInputWithRadius = useStableCallback((newRadius: number) => {
    dispatch({ type: "SET_RADIUS", radius: newRadius });
    dispatch({ type: "SET_RADIUS_INPUT", input: newRadius.toString() });
  });

  const handleRadiusInputChange = useStableCallback((inputValue: string) => {
    dispatch({ type: "SET_RADIUS_INPUT", input: inputValue });
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && numValue >= 0.5 && numValue <= 200) {
      dispatch({ type: "SET_RADIUS", radius: numValue });
    }
  });

  const getLayersForPostalCode = useStableCallback((postalCode: string) => {
    if (!layers || layers.length === 0) {
      return [];
    }
    return layers.filter((layer) =>
      layer.postalCodes?.some((pc) => pc.postalCode === postalCode)
    );
  });

  const convertPostalCodeToGranularity = useStableCallback(
    (postalCode: string, granularityLevel: string): string => {
      if (!postalCode) {
        return postalCode;
      }
      const cleanCode = postalCode.replace(/\D/g, "");
      switch (granularityLevel) {
        case "1digit": {
          return cleanCode.slice(0, 1);
        }
        case "2digit": {
          return cleanCode.slice(0, 2);
        }
        case "3digit": {
          return cleanCode.slice(0, 3);
        }
        default: {
          return cleanCode;
        }
      }
    }
  );

  const handleInputChange = useStableCallback((value: string) => {
    dispatch({ type: "SET_QUERY", query: value });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (value.length < 2) {
      dispatch({ type: "SET_RESULTS", results: [] });
      return;
    }

    dispatch({ type: "SET_LOADING", isLoading: true });
    timeoutRef.current = setTimeout(async () => {
      const geocodePromise = async () => {
        const looksLikeAddress = /\d/.test(value.trim());

        const geocodeResult = await geocodeSearchAction({
          query: value,
          includePostalCode: looksLikeAddress,
          limit: 8,
          enhancedSearch: true,
        });

        dispatch({ type: "SET_LOADING", isLoading: false });

        if (!geocodeResult.success || !geocodeResult.data) {
          throw new Error(geocodeResult.error ?? "Geocoding failed");
        }

        const fetchedResults = geocodeResult.data.results ?? [];

        dispatch({ type: "SET_RESULTS", results: fetchedResults });

        if (fetchedResults.length === 0) {
          throw new Error(
            `Keine Ergebnisse für "${value}" gefunden. Versuchen Sie deutsche Stadtnamen (z.B. München statt Munich) oder PLZ.`
          );
        }

        return `${fetchedResults.length} Adressen gefunden`;
      };

      executeAction(geocodePromise(), {
        loading: `Suche nach "${value}"... (DE/EN unterstützt)`,
        success: (message) => message as string,
        error: (error) =>
          error instanceof Error ? error.message : "Adresssuche fehlgeschlagen",
      });
    }, 300);
  });

  const handleDirectSelect = useStableCallback((result: GeocodeResult) => {
    dispatch({ type: "SET_OPEN", open: false });

    const isAdministrativeArea =
      !result.postal_code &&
      (result.city ||
        result.state ||
        result.display_name.includes(", Deutschland") ||
        result.display_name.includes(", Bayern") ||
        result.display_name.includes(", Nordrhein-Westfalen") ||
        result.display_name.includes(" Deutschland") ||
        /\b(Stadt|Kreis|Landkreis|Region|Bundesland)\b/i.test(
          result.display_name
        ));

    if (isAdministrativeArea && onBoundarySelect) {
      const areaName =
        result.city ?? result.state ?? result.display_name.split(",")[0];
      const boundarySearchPromise = async () => {
        const boundaryResult = await searchPostalCodesByBoundaryAction({
          areaName,
          granularity,
          limit: 3000,
        });

        if (!boundaryResult.success || !boundaryResult.data) {
          throw new Error(boundaryResult.error ?? "Boundary search failed");
        }

        const data = boundaryResult.data;
        if (data.postalCodes && data.postalCodes.length > 0) {
          onBoundarySelect(data.postalCodes);
          return `${data.count} PLZ-Regionen in ${data.areaInfo.name} ausgewählt`;
        }
        throw new Error("Keine PLZ-Regionen in diesem Gebiet gefunden");
      };

      executeAction(boundarySearchPromise(), {
        loading: `Suche PLZ-Regionen in ${result.display_name}...`,
        success: (message: string) => message,
        error: (error: unknown) =>
          error instanceof Error ? error.message : "Ein Fehler ist aufgetreten",
      });

      return;
    }

    const adjustedPostalCode = result.postal_code
      ? convertPostalCodeToGranularity(result.postal_code, granularity)
      : result.postal_code;

    onAddressSelect(
      result.coordinates,
      result.display_name,
      adjustedPostalCode
    );
  });

  const handleRadiusSelect = useStableCallback((result: GeocodeResult) => {
    dispatch({ type: "OPEN_RADIUS", coords: result.coordinates });
  });

  const handleRadiusConfirm = useStableCallback(async () => {
    if (state.selectedCoords) {
      const finalRadius = parseFloat(state.customRadiusInput);

      if (isNaN(finalRadius) || finalRadius < 0.1 || finalRadius > 1000) {
        toast.error(
          "Bitte geben Sie einen gültigen Radius zwischen 0.1 und 1000 ein"
        );
        return;
      }

      const searchPromise = async () => {
        if (state.searchMode === "straight") {
          await onRadiusSelect(state.selectedCoords!, finalRadius, granularity);
          return `${finalRadius}km Luftlinie erfolgreich ausgewählt`;
        }
        const mode = state.searchMode === "distance" ? "distance" : "time";
        const method = "osrm";

        if (performDrivingRadiusSearch) {
          await performDrivingRadiusSearch(
            state.selectedCoords!,
            finalRadius,
            granularity,
            mode,
            method
          );
        } else {
          throw new Error("Driving radius search is not available");
        }

        const unit = mode === "time" ? "min" : "km";
        const modeText = mode === "time" ? "Fahrzeit" : "Fahrstrecke";
        return `${finalRadius}${unit} ${modeText} erfolgreich ausgewählt`;
      };

      await searchPromise();

      dispatch({ type: "CLOSE_RADIUS" });
    }
  });

  const formatDisplayName = (result: GeocodeResult): string => {
    const isAdministrativeArea =
      !result.postal_code &&
      (result.city ||
        result.state ||
        result.display_name.includes(", Deutschland") ||
        result.display_name.includes(", Bayern") ||
        result.display_name.includes(", Nordrhein-Westfalen") ||
        result.display_name.includes(" Deutschland") ||
        /\b(Stadt|Kreis|Landkreis|Region|Bundesland)\b/i.test(
          result.display_name
        ));

    if (isAdministrativeArea && onBoundarySelect) {
      return `${
        result.city || result.state || result.display_name.split(",")[0]
      } (Gebiet)`;
    }

    if (result.postal_code) {
      return `${result.postal_code} - ${result.city || result.display_name}`;
    }
    return result.display_name;
  };

  return {
    state,
    dispatch,
    syncInputWithRadius,
    handleRadiusInputChange,
    getLayersForPostalCode,
    handleInputChange,
    handleDirectSelect,
    handleRadiusSelect,
    handleRadiusConfirm,
    formatDisplayName,
  };
}

interface RadiusSearchDialogProps {
  open: boolean;
  onOpenChange: (val: boolean) => void;
  customRadiusInput: string;
  searchMode: "straight" | "distance" | "time";
  dispatch: (action: AutocompleteAction) => void;
  syncInputWithRadius: (radius: number) => void;
  handleRadiusInputChange: (value: string) => void;
  handleConfirm: () => void;
}

function RadiusSearchDialog({
  open,
  onOpenChange,
  customRadiusInput,
  searchMode,
  dispatch,
  syncInputWithRadius,
  handleRadiusInputChange,
  handleConfirm,
}: RadiusSearchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Umkreis auswählen</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Wählen Sie Art und Größe des Suchradius
          </p>
        </DialogHeader>
        <div className="space-y-6">
          {/* Enhanced search mode selector with better UX */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Button
                variant="outline"
                size="default"
                onClick={() =>
                  dispatch({ type: "SET_SEARCH_MODE", mode: "straight" })
                }
                className={`h-auto p-4 text-left flex flex-col items-start gap-1 transition-all ${
                  searchMode === "straight"
                    ? "border-primary ring-1 ring-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
                role="radio"
                aria-checked={searchMode === "straight"}
                tabIndex={0}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium">Luftlinie</span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full ml-auto">
                    Schnell
                  </span>
                </div>
                <span
                  className={`text-xs ${searchMode === "straight" ? "text-primary" : "text-muted-foreground"}`}
                >
                  Direkte Entfernung (wie der Vogel fliegt)
                </span>
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() =>
                  dispatch({ type: "SET_SEARCH_MODE", mode: "distance" })
                }
                className={`h-auto p-4 text-left flex flex-col items-start gap-1 transition-all ${
                  searchMode === "distance"
                    ? "border-primary ring-1 ring-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
                role="radio"
                aria-checked={searchMode === "distance"}
                tabIndex={0}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium">Fahrstrecke (km)</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full ml-auto">
                    Präzise
                  </span>
                </div>
                <span
                  className={`text-xs ${searchMode === "distance" ? "text-primary" : "text-muted-foreground"}`}
                >
                  Tatsächliche Straßenentfernung
                </span>
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() =>
                  dispatch({ type: "SET_SEARCH_MODE", mode: "time" })
                }
                className={`h-auto p-4 text-left flex flex-col items-start gap-1 transition-all ${
                  searchMode === "time"
                    ? "border-primary ring-1 ring-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
                role="radio"
                aria-checked={searchMode === "time"}
                tabIndex={0}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium">Fahrzeit (min)</span>
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full ml-auto">
                    Realistisch
                  </span>
                </div>
                <span
                  className={`text-xs ${searchMode === "time" ? "text-primary" : "text-muted-foreground"}`}
                >
                  Geschätzte Fahrtdauer
                </span>
              </Button>
            </div>
          </div>

          {/* Smart preset buttons with contextual values */}
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">
                Häufige Werte für{" "}
                {searchMode === "straight"
                  ? "Luftlinie"
                  : searchMode === "distance"
                    ? "Fahrstrecke"
                    : "Fahrzeit"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {searchMode === "straight"
                  ? "Direkte Entfernung in km"
                  : searchMode === "distance"
                    ? "Tatsächliche Straßenentfernung in km"
                    : "Realistische Fahrtdauer in Minuten"}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(searchMode === "time"
                ? [5, 15, 30, 45] // Time presets in minutes
                : [1, 5, 10, 25]
              ) // Distance presets in km
                .map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() => syncInputWithRadius(preset)}
                    className="text-xs font-medium"
                  >
                    {preset}
                    {searchMode === "time" ? "min" : "km"}
                  </Button>
                ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(searchMode === "time"
                ? [60, 90, 120, 180] // Extended time presets
                : [50, 75, 100, 150]
              ) // Extended distance presets
                .map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      dispatch({
                        type: "SET_RADIUS_INPUT",
                        input: preset.toString(),
                      });
                      dispatch({ type: "SET_RADIUS", radius: preset });
                    }}
                    className="text-xs font-medium"
                  >
                    {preset}
                    {searchMode === "time" ? "min" : "km"}
                  </Button>
                ))}
            </div>
          </div>

          {/* Slider for 0.5-200 range */}
          {/* <div className="space-y-2">
              <Label htmlFor="radius-slider">
                Präzise Auswahl: {radius}{" "}
                {searchMode === "time" ? "min" : "km"}
              </Label>
              <Slider
                id="radius-slider"
                min={0.5}
                max={200}
                step={0.5}
                value={[radius]}
                onValueChange={(value) => syncInputWithRadius(value[0])}
                className="w-full pt-4"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.5{searchMode === "time" ? "min" : "km"}</span>
                <span>200{searchMode === "time" ? "min" : "km"}</span>
              </div>
            </div>*/}

          {/* Direct input for any value */}
          <div className="space-y-2">
            <Label htmlFor="radius-input">
              Exakte Eingabe (0.1-1000{searchMode === "time" ? "min" : "km"})
            </Label>
            <Input
              id="radius-input"
              type="number"
              min="0.1"
              max="1000"
              step="0.1"
              value={customRadiusInput}
              onChange={(e) => handleRadiusInputChange(e.target.value)}
              placeholder="z.B. 75.5"
              className="w-full"
            />
            <div className="text-xs text-muted-foreground">
              Werte zwischen 0.1{searchMode === "time" ? "min" : "km"} und 1000
              {searchMode === "time" ? "min" : "km"} sind möglich
            </div>
          </div>
        </div>
        {/* Enhanced result summary with accuracy indicators */}
        <div className="text-sm border-t pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Ausgewählter Radius:</span>
            <span className="font-medium text-foreground">
              {customRadiusInput}
              {searchMode === "time" ? "min" : "km"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Suchmethode:</span>
            <span className="font-medium text-foreground">
              {searchMode === "straight"
                ? "Luftlinie"
                : searchMode === "distance"
                  ? "Fahrstrecke"
                  : "Fahrzeit"}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirm}>
              {customRadiusInput}
              {searchMode === "time" ? "min" : "km"}{" "}
              {searchMode === "straight"
                ? "Luftlinie"
                : searchMode === "distance"
                  ? "Fahrstrecke"
                  : "Fahrzeit"}{" "}
              auswählen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const AddressAutocompleteEnhanced = memo(
  function AddressAutocompleteEnhanced({
    onAddressSelect,
    onBoundarySelect,
    onRadiusSelect,
    onPreviewSelect,
    performDrivingRadiusSearch,
    granularity,
    triggerClassName = "",
    previewPostalCode,
    layers = EMPTY_ARRAY,
  }: AddressAutocompleteEnhancedProps) {
    const {
      state,
      dispatch,
      syncInputWithRadius,
      handleRadiusInputChange,
      getLayersForPostalCode,
      handleInputChange,
      handleDirectSelect,
      handleRadiusSelect,
      handleRadiusConfirm,
      formatDisplayName,
    } = useAddressAutocomplete({
      onAddressSelect,
      onBoundarySelect,
      onRadiusSelect,
      performDrivingRadiusSearch,
      granularity,
      layers,
    });

    const {
      open,
      query,
      results,
      isLoading,
      radiusDialogOpen,
      customRadiusInput,
      searchMode,
    } = state;

    return (
      <>
        <Popover
          open={open}
          onOpenChange={(val) => dispatch({ type: "SET_OPEN", open: val })}
        >
          <PopoverTrigger
            render={
              <Button
                variant="secondary"
                role="combobox"
                aria-expanded={open}
                aria-controls="address-search-listbox"
                className={`w-full justify-between ${triggerClassName}`}
              />
            }
          >
            <span className="truncate block w-full text-left">
              {query || "PLZ, Adresse, Stadt oder Region suchen... (DE/EN)"}
            </span>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0">
            <Command>
              <CommandInput
                placeholder="PLZ, Adresse, Stadt oder Region suchen... (München, Munich, Berlin, Bayern, etc.)"
                value={query}
                onValueChange={handleInputChange}
                autoComplete="off"
              />
              <CommandList id="address-search-listbox">
                {isLoading && (
                  <div className="p-3 text-sm text-muted-foreground">
                    Suche läuft...
                  </div>
                )}
                {!isLoading && results.length === 0 && query.length >= 2 && (
                  <CommandEmpty>Keine Ergebnisse gefunden.</CommandEmpty>
                )}
                {results.map((result) => (
                  <CommandItem
                    key={result.id}
                    value={result.display_name}
                    className="p-0"
                    onSelect={() => {
                      // Prevent default selection behavior, we handle it with buttons
                    }}
                  >
                    <div className="flex items-center gap-2 p-2 w-full">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {formatDisplayName(result)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {result.display_name}
                        </div>
                        {result.postal_code &&
                          (() => {
                            const containingLayers = getLayersForPostalCode(
                              result.postal_code
                            );
                            if (containingLayers.length > 0) {
                              return (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {containingLayers.map((layer) => (
                                    <span
                                      key={layer.id}
                                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md border"
                                      style={{
                                        borderColor: layer.color,
                                        backgroundColor: `${layer.color}15`,
                                        color: layer.color,
                                      }}
                                    >
                                      <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: layer.color }}
                                      />
                                      {layer.name}
                                    </span>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          })()}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {onPreviewSelect && result.postal_code && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    size="sm"
                                    variant={
                                      previewPostalCode === result.postal_code
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onPreviewSelect(
                                        result.coordinates,
                                        formatDisplayName(result),
                                        result.postal_code
                                      );
                                    }}
                                    className="h-8 px-2"
                                  />
                                }
                              >
                                {previewPostalCode === result.postal_code ? (
                                  <EyeOffIcon className="h-3 w-3" />
                                ) : (
                                  <EyeIcon className="h-3 w-3" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {previewPostalCode === result.postal_code
                                    ? "Vorschau beenden"
                                    : "Vorschau & Zoom zur PLZ"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDirectSelect(result);
                                  }}
                                  className="h-8 px-2"
                                />
                              }
                            >
                              <MapPinIcon className="h-3 w-3" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {!result.postal_code &&
                                (result.city ||
                                  result.state ||
                                  result.display_name.includes(
                                    ", Deutschland"
                                  )) &&
                                onBoundarySelect
                                  ? "Alle PLZ-Regionen in diesem Gebiet auswählen"
                                  : "Exakte Position auswählen"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRadiusSelect(result);
                                  }}
                                  className="h-8 px-2"
                                />
                              }
                            >
                              <RadiusIcon className="h-3 w-3" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Umkreis um Position auswählen</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <RadiusSearchDialog
          open={radiusDialogOpen}
          onOpenChange={(val) => {
            if (!val) {
              dispatch({ type: "CLOSE_RADIUS" });
            }
          }}
          customRadiusInput={customRadiusInput}
          searchMode={searchMode}
          dispatch={dispatch}
          syncInputWithRadius={syncInputWithRadius}
          handleRadiusInputChange={handleRadiusInputChange}
          handleConfirm={handleRadiusConfirm}
        />
      </>
    );
  }
);
