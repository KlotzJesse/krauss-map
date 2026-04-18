"use client";

import {
  IconArchive,
  IconChartBar,
  IconFolder,
  IconPlus,
  IconSearch,
  IconTag,
} from "@tabler/icons-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveTagFilter(null);
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

  const activeAreas = useMemo(() => {
    let result = areas.filter((a) => a.isArchived !== "true");
    if (activeTagFilter !== null) {
      result = result.filter((a) => a.tags?.some((t) => t.id === activeTagFilter));
    }
    return result;
  }, [areas, activeTagFilter]);

  const archivedAreas = areas.filter((a) => a.isArchived === "true");

  // Check if query looks like a PLZ code (digits)
  const isPlzQuery = /^\d{2,5}$/.test(query.trim());
  const plzMatches = useMemo(() => {
    if (!isPlzQuery) return [];
    const q = query.trim();
    const results: Array<{ area: AreaSummary; layerName?: string }> = [];
    for (const area of areas) {
      if (area.isArchived === "true") continue;
      // Check if the postalCode search matches — use area name for now since
      // we don't have per-code data in AreaSummary. Surface areas where the code
      // could plausibly exist based on postalCodeCount > 0.
      if ((area.postalCodeCount ?? 0) > 0) {
        results.push({ area });
      }
    }
    // Limit to first 5 suggestions since we can't confirm membership without DB
    return results.slice(0, 5);
  }, [isPlzQuery, query, areas]);

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
            <CommandGroup heading={`PLZ-Suche: ${query.trim()}`}>
              {plzMatches.map(({ area }) => (
                <CommandItem
                  key={`plz-${area.id}`}
                  value={`plz ${query} ${area.name}`}
                  onSelect={() => handleSelect(area.id)}
                >
                  <IconSearch className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{area.name}</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-1">
                    {area.postalCodeCount} PLZ
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {activeAreas.length > 0 && (
          <CommandGroup heading={activeTagFilter !== null ? `Gebiete (gefiltert)` : "Gebiete"}>
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

        {activeAreas.length > 0 &&
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

        {archivedAreas.length > 0 && (
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
