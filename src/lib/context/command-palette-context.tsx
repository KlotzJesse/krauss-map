"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** What the palette needs to *render* the area's commands. */
export interface MapCommandMeta {
  areaId: number;
  areaName: string;
  granularity: string;
  layers: {
    id: number;
    name: string;
    color: string;
    isVisible?: string;
    postalCodes?: { postalCode: string }[];
  }[];
  activeLayerId: number | null;
}

/**
 * What the palette can *do* to the open area.
 *
 * Every entry is optional because the handlers live in three different places —
 * the view owns the search actions, the map owns navigation, the tools panel
 * owns layers and versions — and each registers the ones it has. The palette
 * skips a command it was never given.
 */
export interface MapCommandHandlers {
  onAddressSelect: (
    coords: [number, number],
    label: string,
    postalCode?: string
  ) => void | Promise<void>;
  onPreviewSelect: (
    coords: [number, number],
    label: string,
    postalCode?: string
  ) => void;
  onBoundarySelect: (postalCodes: string[]) => void | Promise<void>;
  onOpenRadiusSearch: (coords?: [number, number]) => void;

  /**
   * Acting on a postal code the user typed, rather than on a geocoder result.
   * The area owns these because it has the postal-code index, so a code
   * resolves to its exact centroid without a geocoding round-trip.
   */
  onAddPostalCode: (code: string) => void | Promise<void>;
  onRemovePostalCode: (code: string) => void | Promise<void>;
  onPreviewPostalCode: (code: string) => void;
  onZoomToPostalCode: (code: string) => void;
  onRadiusAroundPostalCode: (code: string) => void;
  /**
   * Whether a code exists in the loaded dataset at all. Layer membership is not
   * asked for here — that changes on every edit, and a handler captured in a ref
   * lags a render behind, so the palette reads membership from mapMeta instead.
   */
  isPostalCodeKnown: (code: string) => boolean;

  onFitAllLayers: () => void;
  onZoomToLayer: (layerId: number) => void;
  onZoomToCountry: () => void;
  onToggleUnassigned: () => void;
  onCycleMapStyle: () => void;
  onSetActiveLayer: (layerId: number) => void;

  onCreateLayer: () => void;
  onDuplicateActiveLayer: () => void;
  onToggleLayerVisibility: (layerId: number) => void;
  onDeleteActiveLayer: () => void;

  onOpenImport: () => void;
  onSelectAllUnassigned: () => void;
  onCopyActiveLayerCodes: () => void;
  onClearDrawings: () => void;

  onOpenVersionHistory: () => void;
  onCreateVersion: () => void;
  onExportExcel: () => void;
  onOpenConflicts: () => void;
}

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Null on pages that are not an open area. */
  mapMeta: MapCommandMeta | null;
  setMapMeta: (meta: MapCommandMeta | null) => void;
  /**
   * Merge in the handlers a component owns. Kept in a ref and read when a
   * command is actually invoked, so re-registering on every render — which is
   * what happens when handlers are inline closures — never re-renders the
   * palette or loops.
   */
  registerCommands: (handlers: Partial<MapCommandHandlers>) => void;
  /**
   * Record which command keys have an owner. Separate from `registerCommands`
   * because this one drives state: it must only be called when the set of keys
   * genuinely changed, never once per commit.
   */
  markAvailable: (keys: string[]) => void;
  handlersRef: React.MutableRefObject<Partial<MapCommandHandlers>>;
  /** Which commands currently have an owner, so the palette can hide the rest. */
  available: ReadonlySet<keyof MapCommandHandlers>;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null
);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mapMeta, setMapMeta] = useState<MapCommandMeta | null>(null);
  const handlersRef = useRef<Partial<MapCommandHandlers>>({});
  const [available, setAvailable] = useState<ReadonlySet<keyof MapCommandHandlers>>(
    () => new Set()
  );

  const markAvailable = useCallback((keys: string[]) => {
    setAvailable((previous) => {
      const missing = keys.filter(
        (key) => !previous.has(key as keyof MapCommandHandlers)
      );
      // Returning `previous` unchanged is what keeps this from looping: the
      // provider re-renders its consumers, they re-run their effects, and if the
      // key set is the same no new state lands.
      if (missing.length === 0) {
        return previous;
      }
      const next = new Set(previous);
      for (const key of missing) {
        next.add(key as keyof MapCommandHandlers);
      }
      return next;
    });
  }, []);

  const registerCommands = useCallback(
    (handlers: Partial<MapCommandHandlers>) => {
      Object.assign(handlersRef.current, handlers);
      markAvailable(Object.keys(handlers));
    },
    [markAvailable]
  );

  const value = useMemo(
    () => ({
      open,
      setOpen,
      mapMeta,
      setMapMeta,
      registerCommands,
      markAvailable,
      handlersRef,
      available,
    }),
    [open, mapMeta, registerCommands, markAvailable, available]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

const NOOP_VALUE: CommandPaletteContextValue = {
  open: false,
  setOpen: () => undefined,
  mapMeta: null,
  setMapMeta: () => undefined,
  registerCommands: () => undefined,
  markAvailable: () => undefined,
  handlersRef: { current: {} },
  available: new Set(),
};

/**
 * Control the palette from anywhere below the provider. Falls back to no-ops
 * rather than throwing, so a component can render outside the map layout.
 */
export function useCommandPalette(): CommandPaletteContextValue {
  return useContext(CommandPaletteContext) ?? NOOP_VALUE;
}

/**
 * Publish the commands a component owns for as long as it is mounted.
 *
 * Two effects on purpose. The first has no dependency array so the palette
 * always holds the latest closures — writing to a ref costs nothing and cannot
 * re-render, so running it after every commit is safe. Doing this during render
 * instead looks simpler but is a render-phase side effect: the React Compiler
 * memoises it away and the palette keeps calling whichever closure it captured
 * first, which showed up as a postal code you had just added still offering
 * "hinzufügen".
 *
 * The second effect is the one that touches state, so it is keyed on the sorted
 * command names. Owners pass a fresh object of inline closures on every render;
 * running a state setter that often is exactly the "setState inside useEffect
 * without a dependency array" shape React aborts with "Maximum update depth
 * exceeded", and it did, intermittently.
 */
export function useRegisterMapCommands(
  handlers: Partial<MapCommandHandlers>
): void {
  const { handlersRef, markAvailable } = useCommandPalette();

  useEffect(() => {
    Object.assign(handlersRef.current, handlers);
  });

  const keys = Object.keys(handlers).sort().join(",");
  useEffect(() => {
    if (keys) {
      markAvailable(keys.split(","));
    }
  }, [keys, markAvailable]);
}

/** Publish the area the palette should offer commands for. */
export function usePublishMapMeta(meta: MapCommandMeta | null): void {
  const { setMapMeta } = useCommandPalette();
  const serialized = meta
    ? `${meta.areaId}|${meta.areaName}|${meta.granularity}|${meta.activeLayerId}|${meta.layers
        .map(
          (l) =>
            `${l.id}:${l.name}:${l.color}:${l.isVisible ?? ""}:${l.postalCodes?.length ?? 0}`
        )
        .join(",")}`
    : null;

  useEffect(() => {
    setMapMeta(meta);
    // `serialized` stands in for the parts of `meta` the palette renders, so a
    // new array identity with identical contents does not churn state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, setMapMeta]);

  // Clearing belongs on unmount only. Returning the cleanup from the effect
  // above ran it on every change too, so each edit blanked the area's commands
  // for a moment and anything reading the meta right then saw null.
  useEffect(() => () => setMapMeta(null), [setMapMeta]);
}
