"use client";

import {
  IconArchive,
  IconFolder,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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

interface CommandPaletteProps {
  areas: AreaSummary[];
  onCreateArea?: () => void;
}

export function CommandPalette({ areas, onCreateArea }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
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

  const handleSelect = useCallback(
    (areaId: number) => {
      setOpen(false);
      router.push(`/postal-codes/${areaId}` as Route);
    },
    [router]
  );

  const activeAreas = areas.filter((a) => a.isArchived !== "true");
  const archivedAreas = areas.filter((a) => a.isArchived === "true");

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Schnellnavigation">
      <CommandInput placeholder="Gebiet suchen…" />
      <CommandList>
        <CommandEmpty>
          <span className="flex flex-col items-center gap-1 text-muted-foreground">
            <IconSearch className="h-6 w-6 mb-1 opacity-30" />
            Keine Gebiete gefunden
          </span>
        </CommandEmpty>

        {activeAreas.length > 0 && (
          <CommandGroup heading="Gebiete">
            {activeAreas.map((area) => (
              <CommandItem
                key={area.id}
                value={area.name}
                onSelect={() => handleSelect(area.id)}
              >
                <IconFolder className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{area.name}</span>
                {area.country && (
                  <span className="text-[10px] text-muted-foreground/60 uppercase ml-1">
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
                setOpen(false);
                onCreateArea();
              }}
            >
              <IconPlus className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Neues Gebiet erstellen</span>
              <CommandShortcut>⌘N</CommandShortcut>
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
