"use client";

import {
  IconArchive,
  IconChartBar,
  IconClock,
  IconCopy,
  IconDeviceFloppy,
  IconEye,
  IconFileExport,
  IconFolder,
  IconLayersSubtract,
  IconMapPin,
  IconMapSearch,
  IconPalette,
  IconPlus,
  IconCircleDashed,
  IconSearch,
  IconStack2,
  IconTag,
  IconTrash,
  IconUpload,
  IconWorld,
  IconZoomScan,
} from "@tabler/icons-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  searchAreasByPostalCodeAction,
  type AreaPlzMatch,
} from "@/app/actions/area-actions";
import { TagBadge } from "@/components/areas/tag-badge";
import { Kbd } from "@/components/ui/kbd";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useCommandPalette } from "@/lib/context/command-palette-context";
import {
  formatGeocodeResult,
  isAdministrativeAreaResult,
  layersContaining,
  toGranularity,
  useBoundaryPostalCodes,
  useGeocodeSearch,
} from "@/lib/hooks/use-geocode-search";
import type { AreaSummary } from "@/lib/types/area-types";

interface CommandPaletteProps {
  areas: AreaSummary[];
  onCreateArea?: () => void;
  /**
   * Render the sidebar search button that opens the palette. This is the only
   * search affordance in the sidebar — it replaced the separate "PLZ suchen"
   * and "Gebiete filtern" inputs, which sat at different nesting depths and so
   * rendered at different widths.
   */
  showTrigger?: boolean;
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const SHORTCUT_LABEL = isMac ? "⌘K" : "Strg K";

export function CommandPalette({
  areas,
  onCreateArea,
  showTrigger = false,
}: CommandPaletteProps) {
  const { open, setOpen, mapMeta, handlersRef, available } =
    useCommandPalette();
  const [query, setQuery] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<number | null>(null);
  const [plzMatches, setPlzMatches] = useState<AreaPlzMatch[]>([]);
  const [_isPending, startTransition] = useTransition();
  const router = useRouter();
  const openRef = useRef(open);
  openRef.current = open;

  // Address, city and region lookup — only while an area is open, since every
  // result acts on that area's layers.
  const isPlzLike = /^\d{1,5}$/.test(query.trim());
  const { results: geocodeResults, isLoading: isGeocoding } = useGeocodeSearch(
    query,
    Boolean(mapMeta) && !isPlzLike
  );
  const resolveBoundary = useBoundaryPostalCodes();
  /** The query read as a postal code, when it is one. */
  const plzQuery = /^\d{1,5}$/.test(query.trim()) ? query.trim() : null;
  const metaRef = useRef(mapMeta);
  metaRef.current = mapMeta;


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!openRef.current);
        return;
      }
      // "/" opens the palette too, unless the user is typing in a field.
      if (e.key === "/" && !(e.metaKey || e.ctrlKey || e.altKey)) {
        const t = e.target as HTMLElement | null;
        const editing =
          !!t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            t.isContentEditable);
        if (!editing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setOpen]);

  // Debounced PLZ search
  useEffect(() => {
    const trimmed = query.trim();
    if (!/^\d{2,5}$/.test(trimmed)) {
      setPlzMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await searchAreasByPostalCodeAction(trimmed);
        if (res.success && res.data) {
          setPlzMatches(res.data);
        } else {
          setPlzMatches([]);
        }
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveTagFilter(null);
    setPlzMatches([]);
  }, []);

  /** Run a map command and close the palette. */
  const runMapAction = useCallback(
    (action: () => void) => {
      handleClose();
      action();
    },
    [handleClose]
  );

  /** Add every postal code inside an administrative area. */
  const runBoundarySelect = useCallback(
    async (result: Parameters<typeof formatGeocodeResult>[0]) => {
      const meta = metaRef.current;
      const onBoundarySelect = handlersRef.current.onBoundarySelect;
      if (!(meta && onBoundarySelect)) {
        return;
      }
      const found = await resolveBoundary(result, meta.granularity);
      if (!found) {
        toast.error("Keine PLZ-Regionen in diesem Gebiet gefunden");
        return;
      }
      await onBoundarySelect(found.postalCodes);
      toast.success(
        `${found.postalCodes.length} PLZ in ${found.areaName} ausgewählt`
      );
    },
    [resolveBoundary, handlersRef]
  );

  const handleSelect = useCallback(
    (areaId: number) => {
      handleClose();
      router.push(`/postal-codes/${areaId}` as Route);
    },
    [router, handleClose]
  );

  // Collect all unique tags across areas
  const allTags = useMemo(() => {
    const tagMap = new Map<
      number,
      { id: number; name: string; color: string }
    >();
    for (const area of areas) {
      for (const tag of area.tags ?? []) {
        if (!tagMap.has(tag.id)) tagMap.set(tag.id, tag);
      }
    }
    return [...tagMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [areas]);

  const isPlzQuery = /^\d{2,5}$/.test(query.trim());

  // Looked up on every render rather than memoised: it reads a ref, and the
  // result must follow layer edits made while the palette is open.
  const plzInArea =
    plzQuery && handlersRef.current.findPostalCode
      ? handlersRef.current.findPostalCode(plzQuery)
      : { known: false, layers: [] as { id: number; name: string; color: string }[] };

  const activeAreas = useMemo(() => {
    let result = areas.filter((a) => a.isArchived !== "true");
    if (activeTagFilter !== null) {
      result = result.filter((a) =>
        a.tags?.some((t) => t.id === activeTagFilter)
      );
    }
    return result;
  }, [areas, activeTagFilter]);

  const archivedAreas = areas.filter((a) => a.isArchived === "true");

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-md border border-border/50 bg-sidebar-accent px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Gebiet oder PLZ suchen"
        >
          <IconSearch className="h-4 w-4 shrink-0" />
          <span className="truncate">Gebiet oder PLZ suchen…</span>
          <Kbd className="ml-auto hidden sm:inline-flex">{SHORTCUT_LABEL}</Kbd>
        </button>
      )}
      <CommandDialog
        open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
        else setOpen(true);
      }}
      title="Schnellnavigation"
    >
      <CommandInput
        placeholder={
          mapMeta
            ? "PLZ, Adresse, Stadt oder Region suchen — oder Aktion…"
            : "Gebiet suchen, PLZ eingeben…"
        }
        value={query}
        onValueChange={setQuery}
      />

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2 pt-1 border-b">
          {allTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() =>
                setActiveTagFilter(activeTagFilter === tag.id ? null : tag.id)
              }
              className={`transition-opacity ${activeTagFilter !== null && activeTagFilter !== tag.id ? "opacity-30" : ""}`}
              title={
                activeTagFilter === tag.id
                  ? "Filter entfernen"
                  : `Nur „${tag.name}"`
              }
            >
              <TagBadge
                name={tag.name}
                color={tag.color}
                small
                className="cursor-pointer hover:brightness-110"
              />
            </button>
          ))}
        </div>
      )}

      <CommandList>
        <CommandEmpty>
          <span className="flex flex-col items-center gap-1 text-muted-foreground">
            <IconSearch className="h-6 w-6 mb-1 opacity-30" />
            Keine Ergebnisse
          </span>
        </CommandEmpty>

        {mapMeta && plzQuery && (
          <>
            <CommandGroup heading={`PLZ ${plzQuery}`}>
              {/* Every value repeats the code, because cmdk filters items by
                  their value — without it a numeric query hides exactly the
                  actions that query is about. */}
              {plzInArea.known ? null : (
                <CommandItem
                  value={`plz ${plzQuery} unbekannt`}
                  disabled
                  onSelect={() => undefined}
                >
                  <IconMapPin className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="text-muted-foreground">
                    PLZ {plzQuery} gibt es in diesem Datensatz nicht
                  </span>
                </CommandItem>
              )}
              {plzInArea.known && (
                <>
                  {plzInArea.layers.length === 0 ? (
                    available.has("onAddPostalCode") && (
                      <CommandItem
                        value={`plz ${plzQuery} hinzufügen aktive ebene`}
                        onSelect={() =>
                          runMapAction(() =>
                            handlersRef.current.onAddPostalCode?.(plzQuery)
                          )
                        }
                      >
                        <IconPlus className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>PLZ {plzQuery} zur aktiven Ebene hinzufügen</span>
                      </CommandItem>
                    )
                  ) : (
                    available.has("onRemovePostalCode") && (
                      <CommandItem
                        value={`plz ${plzQuery} entfernen`}
                        onSelect={() =>
                          runMapAction(() =>
                            handlersRef.current.onRemovePostalCode?.(plzQuery)
                          )
                        }
                      >
                        <IconTrash className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="flex-1">
                          PLZ {plzQuery} aus der aktiven Ebene entfernen
                        </span>
                        <span className="flex gap-0.5 shrink-0">
                          {plzInArea.layers.slice(0, 3).map((layer) => (
                            <span
                              key={layer.id}
                              className="w-2 h-2 rounded-full border border-white/20"
                              style={{ backgroundColor: layer.color }}
                              title={layer.name}
                            />
                          ))}
                        </span>
                      </CommandItem>
                    )
                  )}
                  {available.has("onPreviewPostalCode") && (
                    <CommandItem
                      value={`plz ${plzQuery} vorschau zeigen karte`}
                      onSelect={() =>
                        runMapAction(() =>
                          handlersRef.current.onPreviewPostalCode?.(plzQuery)
                        )
                      }
                    >
                      <IconEye className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>PLZ {plzQuery} auf der Karte zeigen</span>
                    </CommandItem>
                  )}
                  {available.has("onZoomToPostalCode") && (
                    <CommandItem
                      value={`plz ${plzQuery} zoomen springen`}
                      onSelect={() =>
                        runMapAction(() =>
                          handlersRef.current.onZoomToPostalCode?.(plzQuery)
                        )
                      }
                    >
                      <IconZoomScan className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Zu PLZ {plzQuery} zoomen</span>
                    </CommandItem>
                  )}
                  {available.has("onRadiusAroundPostalCode") && (
                    <CommandItem
                      value={`plz ${plzQuery} umkreis radius`}
                      onSelect={() =>
                        runMapAction(() =>
                          handlersRef.current.onRadiusAroundPostalCode?.(
                            plzQuery
                          )
                        )
                      }
                    >
                      <IconCircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Umkreis um PLZ {plzQuery}</span>
                    </CommandItem>
                  )}
                </>
              )}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {mapMeta && geocodeResults.length > 0 && (
          <>
            <CommandGroup heading="Adressen & Orte">
              {geocodeResults.map((result) => {
                const isArea = isAdministrativeAreaResult(result);
                const code = result.postal_code
                  ? toGranularity(result.postal_code, mapMeta.granularity)
                  : undefined;
                const containing = code
                  ? layersContaining(code, mapMeta.layers)
                  : [];
                return (
                  <CommandItem
                    key={`geo-${result.id}`}
                    value={`ort ${result.display_name}`}
                    onSelect={() => {
                      handleClose();
                      if (isArea) {
                        void runBoundarySelect(result);
                        return;
                      }
                      void handlersRef.current.onAddressSelect?.(
                        result.coordinates,
                        result.display_name,
                        code
                      );
                    }}
                  >
                    {isArea ? (
                      <IconMapSearch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <IconMapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 truncate">
                      {formatGeocodeResult(result)}
                    </span>
                    {containing.length > 0 && (
                      <span className="flex gap-0.5 shrink-0" title="Bereits zugewiesen">
                        {containing.slice(0, 3).map((layer) => (
                          <span
                            key={layer.id}
                            className="w-2 h-2 rounded-full border border-white/20"
                            style={{ backgroundColor: layer.color }}
                            title={layer.name}
                          />
                        ))}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">
                      {isArea ? "alle PLZ" : "hinzufügen"}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {/* Same results again, as the non-destructive actions. cmdk filters
                on `value`, so each action needs its own item rather than
                buttons inside one row, which the list would not reach by
                keyboard. */}
            <CommandGroup heading="Auf der Karte zeigen">
              {geocodeResults.slice(0, 5).map((result) => (
                <CommandItem
                  key={`preview-${result.id}`}
                  value={`vorschau zeigen ${result.display_name}`}
                  onSelect={() => {
                    handleClose();
                    handlersRef.current.onPreviewSelect?.(
                      result.coordinates,
                      result.display_name,
                      result.postal_code
                        ? toGranularity(
                            result.postal_code,
                            mapMeta.granularity
                          )
                        : undefined
                    );
                  }}
                >
                  <IconEye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">
                    {formatGeocodeResult(result)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">
                    nur anzeigen
                  </span>
                </CommandItem>
              ))}
              {geocodeResults.slice(0, 5).map((result) => (
                <CommandItem
                  key={`radius-${result.id}`}
                  value={`umkreis radius ${result.display_name}`}
                  onSelect={() => {
                    handleClose();
                    handlersRef.current.onOpenRadiusSearch?.(result.coordinates);
                  }}
                >
                  <IconCircleDashed className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">
                    Umkreis um {formatGeocodeResult(result)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {mapMeta && (
          <>
            <CommandGroup heading={`Karte — ${mapMeta.areaName}`}>
              {available.has("onFitAllLayers") && (
                <CommandItem
                value="karte alle ebenen anzeigen fit"
                onSelect={() => runMapAction(() => handlersRef.current.onFitAllLayers?.())}
              >
                <IconZoomScan className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Alle Ebenen anzeigen</span>
                <CommandShortcut>G</CommandShortcut>
              </CommandItem>
              )}
              {available.has("onZoomToCountry") && (
                <CommandItem
                value="karte länderübersicht zoomen"
                onSelect={() => runMapAction(() => handlersRef.current.onZoomToCountry?.())}
              >
                <IconWorld className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Zur Länderübersicht zoomen</span>
              </CommandItem>
              )}
              {available.has("onToggleUnassigned") && (
                <CommandItem
                value="karte nicht zugeordnete plz anzeigen"
                onSelect={() => runMapAction(() => handlersRef.current.onToggleUnassigned?.())}
              >
                <IconEye className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Nicht zugeordnete PLZ ein-/ausblenden</span>
              </CommandItem>
              )}
              {available.has("onCycleMapStyle") && (
                <CommandItem
                value="karte kartenstil wechseln"
                onSelect={() => runMapAction(() => handlersRef.current.onCycleMapStyle?.())}
              >
                <IconPalette className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Kartenstil wechseln</span>
                <CommandShortcut>M</CommandShortcut>
              </CommandItem>
              )}
              {available.has("onZoomToLayer") &&
                mapMeta.layers.map((layer) => (
                <CommandItem
                  key={`zoom-${layer.id}`}
                  value={`ebene zoomen ${layer.name}`}
                  onSelect={() =>
                    runMapAction(() => handlersRef.current.onZoomToLayer?.(layer.id))
                  }
                >
                  <IconZoomScan
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: layer.color }}
                  />
                  <span className="flex-1 truncate">
                    Zu „{layer.name}" zoomen
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />

            <CommandGroup heading="Ebenen">
              {available.has("onCreateLayer") && (
                <CommandItem
                value="ebene neue erstellen"
                onSelect={() => runMapAction(() => handlersRef.current.onCreateLayer?.())}
              >
                <IconPlus className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Neue Ebene anlegen</span>
                <CommandShortcut>N</CommandShortcut>
              </CommandItem>
              )}
              {available.has("onDuplicateActiveLayer") && (
                <CommandItem
                value="ebene aktive duplizieren"
                onSelect={() => runMapAction(() => handlersRef.current.onDuplicateActiveLayer?.())}
              >
                <IconCopy className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Aktive Ebene duplizieren</span>
                <CommandShortcut>D</CommandShortcut>
              </CommandItem>
              )}
              {available.has("onDeleteActiveLayer") && (
                <CommandItem
                value="ebene aktive löschen"
                onSelect={() => runMapAction(() => handlersRef.current.onDeleteActiveLayer?.())}
              >
                <IconTrash className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Aktive Ebene löschen</span>
              </CommandItem>
              )}
              {available.has("onSetActiveLayer") &&
                mapMeta.layers.map((layer) => (
                <CommandItem
                  key={`activate-${layer.id}`}
                  value={`ebene aktivieren wechseln ${layer.name}`}
                  onSelect={() =>
                    runMapAction(() => handlersRef.current.onSetActiveLayer?.(layer.id))
                  }
                >
                  <IconStack2
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: layer.color }}
                  />
                  <span className="flex-1 truncate">
                    „{layer.name}" aktivieren
                  </span>
                  {layer.id === mapMeta.activeLayerId && (
                    <span className="text-[10px] text-muted-foreground/60">
                      aktiv
                    </span>
                  )}
                </CommandItem>
              ))}
              {available.has("onToggleLayerVisibility") &&
                mapMeta.layers.map((layer) => (
                <CommandItem
                  key={`visibility-${layer.id}`}
                  value={`ebene sichtbarkeit ${layer.name}`}
                  onSelect={() =>
                    runMapAction(() =>
                      handlersRef.current.onToggleLayerVisibility?.(layer.id)
                    )
                  }
                >
                  <IconEye
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: layer.color }}
                  />
                  <span className="flex-1 truncate">
                    „{layer.name}" ein-/ausblenden
                  </span>
                  {layer.isVisible === "false" && (
                    <span className="text-[10px] text-muted-foreground/60">
                      ausgeblendet
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />

            <CommandGroup heading="PLZ">
              {available.has("onOpenImport") && (
                <CommandItem
                value="plz importieren"
                onSelect={() => runMapAction(() => handlersRef.current.onOpenImport?.())}
              >
                <IconUpload className="h-3.5 w-3.5 text-muted-foreground" />
                <span>PLZ importieren</span>
              </CommandItem>
              )}
              {available.has("onOpenRadiusSearch") && (
                <CommandItem
                value="plz umkreissuche radius"
                onSelect={() =>
                  runMapAction(() => handlersRef.current.onOpenRadiusSearch?.())
                }
              >
                <IconCircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Umkreissuche…</span>
              </CommandItem>
              )}
              {available.has("onSelectAllUnassigned") && (
                <CommandItem
                value="plz nicht zugeordnete auswählen"
                onSelect={() => runMapAction(() => handlersRef.current.onSelectAllUnassigned?.())}
              >
                <IconLayersSubtract className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Alle nicht zugeordneten PLZ hinzufügen</span>
                <CommandShortcut>⌘A</CommandShortcut>
              </CommandItem>
              )}
              {available.has("onCopyActiveLayerCodes") && (
                <CommandItem
                value="plz kopieren aktive ebene"
                onSelect={() => runMapAction(() => handlersRef.current.onCopyActiveLayerCodes?.())}
              >
                <IconCopy className="h-3.5 w-3.5 text-muted-foreground" />
                <span>PLZ der aktiven Ebene kopieren</span>
                <CommandShortcut>⌘C</CommandShortcut>
              </CommandItem>
              )}
              {available.has("onClearDrawings") && (
                <CommandItem
                value="zeichnungen löschen leeren"
                onSelect={() => runMapAction(() => handlersRef.current.onClearDrawings?.())}
              >
                <IconTrash className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Zeichnungen entfernen</span>
              </CommandItem>
              )}
            </CommandGroup>
            <CommandSeparator />

            <CommandGroup heading="Gebiet & Versionen">
              {available.has("onOpenVersionHistory") && (
                <CommandItem
                value="version verlauf historie"
                onSelect={() => runMapAction(() => handlersRef.current.onOpenVersionHistory?.())}
              >
                <IconClock className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Versionsverlauf</span>
              </CommandItem>
              )}
              {available.has("onCreateVersion") && (
                <CommandItem
                value="version erstellen speichern"
                onSelect={() => runMapAction(() => handlersRef.current.onCreateVersion?.())}
              >
                <IconDeviceFloppy className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Version erstellen</span>
              </CommandItem>
              )}
              {available.has("onExportExcel") && (
                <CommandItem
                value="export excel csv"
                onSelect={() => runMapAction(() => handlersRef.current.onExportExcel?.())}
              >
                <IconFileExport className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Als Excel exportieren</span>
              </CommandItem>
              )}
              {available.has("onOpenConflicts") && (
                <CommandItem
                value="konflikte lösen überschneidungen"
                onSelect={() => runMapAction(() => handlersRef.current.onOpenConflicts?.())}
              >
                <IconLayersSubtract className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Konflikte lösen</span>
              </CommandItem>
              )}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {isPlzQuery && plzMatches.length > 0 && (
          <>
            <CommandGroup heading={`PLZ ${query.trim()} — gefunden in:`}>
              {plzMatches.map((match) => (
                <CommandItem
                  key={`plz-${match.areaId}-${match.layerId}`}
                  value={`plz ${query} ${match.areaName} ${match.layerName}`}
                  onSelect={() => handleSelect(match.areaId)}
                >
                  <IconMapPin
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: match.layerColor }}
                  />
                  <span className="flex-1 truncate">{match.areaName}</span>
                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[120px] flex items-center gap-1">
                    {match.layerName}
                    {match.matchCount != null && match.matchCount > 1 && (
                      <span className="text-[9px] bg-muted rounded px-1 py-0.5 font-mono">
                        {match.matchCount}×
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!isPlzQuery && activeAreas.length > 0 && (
          <CommandGroup
            heading={
              activeTagFilter !== null ? "Gebiete (gefiltert)" : "Gebiete"
            }
          >
            {activeAreas.map((area) => (
              <CommandItem
                key={area.id}
                value={area.name}
                onSelect={() => handleSelect(area.id)}
              >
                <IconFolder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{area.name}</span>
                {area.tags && area.tags.length > 0 && (
                  <div className="flex gap-0.5 ml-1 shrink-0">
                    {area.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        className="w-2 h-2 rounded-full border border-white/20"
                        style={{ backgroundColor: tag.color }}
                        title={tag.name}
                      />
                    ))}
                  </div>
                )}
                {area.country && (
                  <span className="text-[10px] text-muted-foreground/60 uppercase ml-1 shrink-0">
                    {area.country}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!isPlzQuery &&
          activeAreas.length > 0 &&
          (onCreateArea || archivedAreas.length > 0) && <CommandSeparator />}

        <CommandGroup heading="Aktionen">
          {onCreateArea && (
            <CommandItem
              value="neues gebiet erstellen"
              onSelect={() => {
                handleClose();
                onCreateArea();
              }}
            >
              <IconPlus className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Neues Gebiet erstellen</span>
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem
            value="dashboard statistiken"
            onSelect={() => {
              handleClose();
              router.push("/dashboard" as Route);
            }}
          >
            <IconChartBar className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Dashboard öffnen</span>
          </CommandItem>
          {activeTagFilter !== null && (
            <CommandItem
              value="tag filter entfernen"
              onSelect={() => setActiveTagFilter(null)}
            >
              <IconTag className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Tag-Filter entfernen</span>
            </CommandItem>
          )}
        </CommandGroup>

        {!isPlzQuery && archivedAreas.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Archiviert">
              {archivedAreas.map((area) => (
                <CommandItem
                  key={area.id}
                  value={`${area.name} archiviert`}
                  onSelect={() => handleSelect(area.id)}
                >
                  <IconArchive className="h-3.5 w-3.5 text-muted-foreground/50" />
                  <span className="line-through text-muted-foreground">
                    {area.name}
                  </span>
                  {area.country && (
                    <span className="text-[10px] text-muted-foreground/40 uppercase ml-1">
                      {area.country}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground/60 flex items-center gap-2">
        <kbd className="rounded border border-border px-1">↑↓</kbd> navigieren
        <kbd className="rounded border border-border px-1">↵</kbd> öffnen
        <kbd className="rounded border border-border px-1">Esc</kbd> schließen
        <span className="ml-auto">
          <kbd className="rounded border border-border px-1">⌘K</kbd>
        </span>
      </div>
      </CommandDialog>
    </>
  );
}
