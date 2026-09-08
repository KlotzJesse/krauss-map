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

  const registerCommands = useCallback(
    (handlers: Partial<MapCommandHandlers>) => {
      Object.assign(handlersRef.current, handlers);
      // Components re-register the same keys on every render, so only a genuine
      // change to the set costs a render.
      setAvailable((previous) => {
        let changed = false;
        for (const key of Object.keys(handlers)) {
          if (!previous.has(key as keyof MapCommandHandlers)) {
            changed = true;
            break;
          }
        }
        if (!changed) {
          return previous;
        }
        const next = new Set(previous);
        for (const key of Object.keys(handlers)) {
          next.add(key as keyof MapCommandHandlers);
        }
        return next;
      });
    },
    []
  );

  const value = useMemo(
    () => ({
      open,
      setOpen,
      mapMeta,
      setMapMeta,
      registerCommands,
      handlersRef,
      available,
    }),
    [open, mapMeta, registerCommands, available]
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
 * Handlers are re-registered on every render, which is what makes inline
 * closures safe here — the palette always calls the latest one.
 */
export function useRegisterMapCommands(
  handlers: Partial<MapCommandHandlers>
): void {
  const { registerCommands } = useCommandPalette();
  registerCommands(handlers);
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
    return () => setMapMeta(null);
    // `serialized` stands in for the parts of `meta` the palette renders, so a
    // new array identity with identical contents does not churn state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, setMapMeta]);
}
