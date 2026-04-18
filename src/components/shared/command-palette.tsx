"use client";

import {
  IconArchive,
  IconChartBar,
  IconFolder,
  IconMapPin,
  IconPlus,
  IconSearch,
  IconTag,
} from "@tabler/icons-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  searchAreasByPostalCodeAction,
  type AreaPlzMatch,
} from "@/app/actions/area-actions";
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
import type { AreaSummary } from "@/lib/types/area-types";

import { TagBadge } from "@/components/areas/tag-badge";

interface CommandPaletteProps {
  areas: AreaSummary[];
  onCreateArea?: () => void;
}

export function CommandPalette({ areas, onCreateArea }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<number | null>(null);
  const [plzMatches, setPlzMatches] = useState<AreaPlzMatch[]>([]);
  const [_isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const handleSelect = useCallback(
    (areaId: number) => {
      handleClose();
      router.push(`/postal-codes/${areaId}` as Route);
    },
    [router, handleClose]
  );

  // Collect all unique tags across areas
  const allTags = useMemo(() => {
    const tagMap = new Map<number, { id: number; name: string; color: string }>();
    for (const area of areas) {
      for (const tag of area.tags ?? []) {
        if (!tagMap.has(tag.id)) tagMap.set(tag.id, tag);
      }
    }
    return [...tagMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [areas]);

  const isPlzQuery = /^\d{2,5}$/.test(query.trim());

  const activeAreas = useMemo(() => {
    let result = areas.filter((a) => a.isArchived !== "true");
    if (activeTagFilter !== null) {
      result = result.filter((a) => a.tags?.some((t) => t.id === activeTagFilter));
    }
    return result;
  }, [areas, activeTagFilter]);

  const archivedAreas = areas.filter((a) => a.isArchived === "true");

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}
      title="Schnellnavigation"
    >
      <CommandInput
        placeholder="Gebiet suchen, PLZ eingeben…"
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
              onClick={() => setActiveTagFilter(activeTagFilter === tag.id ? null : tag.id)}
              className={`transition-opacity ${activeTagFilter !== null && activeTagFilter !== tag.id ? "opacity-30" : ""}`}
              title={activeTagFilter === tag.id ? "Filter entfernen" : `Nur „${tag.name}"`}
            >
              <TagBadge name={tag.name} color={tag.color} small className="cursor-pointer hover:brightness-110" />
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

        {isPlzQuery && plzMatches.length > 0 && (
          <>
            <CommandGroup heading={`PLZ ${query.trim()} — gefunden in:`}>
              {plzMatches.map((match) => (
                <CommandItem
                  key={`plz-${match.areaId}-${match.layerId}`}
                  value={`plz ${query} ${match.areaName} ${match.layerName}`}
                  onSelect={() => handleSelect(match.areaId)}
                >
                  <IconMapPin className="h-3.5 w-3.5 shrink-0" style={{ color: match.layerColor }} />
                  <span className="flex-1 truncate">{match.areaName}</span>
                  <span className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]">
                    {match.layerName}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {!isPlzQuery && activeAreas.length > 0 && (
          <CommandGroup heading={activeTagFilter !== null ? "Gebiete (gefiltert)" : "Gebiete"}>
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

        {!isPlzQuery && activeAreas.length > 0 &&
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
  );
}
