"use client";

import { IconFolder, IconMapPin, IconPlus, IconTag } from "@tabler/icons-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useDebounce } from "use-debounce";

import {
  searchPostalCodeInAreasAction,
  type PlzSearchResult,
} from "@/app/actions/area-actions";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { AreaSummary } from "@/lib/types/area-types";

/** Muted (not accent) selection, matching the palette style used in krauss-bi. */
const ITEM_CLASS =
  "gap-2.5 rounded-md data-[selected=true]:!bg-muted data-[selected=true]:!text-foreground";

function TypeTag({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="ml-auto shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
    >
      {children}
    </Badge>
  );
}

export interface AreaCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: AreaSummary[];
  onCreateArea?: () => void;
}

/**
 * The merged search: areas and postal codes in one palette.
 *
 * Areas are already in memory (the sidebar renders them), so they filter
 * locally on every keystroke. Postal codes live in a 154k-row table, so they
 * are looked up through a debounced server action and only once the query
 * looks like a postal code.
 */
export default function AreaCommandDialog({
  open,
  onOpenChange,
  areas,
  onCreateArea,
}: AreaCommandDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [debouncedQuery] = useDebounce(query, 250);
  const [plzResults, setPlzResults] = useState<PlzSearchResult[]>([]);
  const [, startTransition] = useTransition();

  // Reset the query each time the palette opens so it never reopens stale.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setPlzResults([]);
    }
  }, [open]);

  // Only the digits/prefix shapes a postal code can take are worth a round trip.
  const plzCandidate = useMemo(() => {
    const q = debouncedQuery.trim();
    return /^[A-Za-z]{0,2}-?\d{2,5}$/.test(q) ? q : "";
  }, [debouncedQuery]);

  useEffect(() => {
    if (!(open && plzCandidate)) {
      setPlzResults([]);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const res = await searchPostalCodeInAreasAction(plzCandidate);
      if (!cancelled && res.success) {
        setPlzResults(res.data ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, plzCandidate]);

  const areaMatches = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const active = areas.filter((a) => a.isArchived !== "true");
    const matched = q
      ? active.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.tags?.some((t) => t.name.toLowerCase().includes(q))
        )
      : active;
    return matched.slice(0, 30);
  }, [areas, deferredQuery]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href as Route);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-2xl">
        <DialogTitle className="sr-only">Suchen</DialogTitle>
        <Command
          // Areas and postal codes are already filtered above; cmdk's own
          // fuzzy pass would drop server-matched postal codes whose label
          // does not literally contain the query.
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12"
        >
          <CommandInput
            placeholder="Gebiet oder PLZ suchen…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[380px]">
            <CommandEmpty>Keine Treffer.</CommandEmpty>

            {plzResults.length > 0 && (
              <>
                <CommandGroup heading={`PLZ ${plzCandidate}`}>
                  {plzResults.map((r) => (
                    <CommandItem
                      key={`plz-${r.areaId}-${r.layerId}`}
                      value={`plz-${r.areaId}-${r.layerId}`}
                      onSelect={() => go(`/postal-codes/${r.areaId}`)}
                      className={ITEM_CLASS}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: r.layerColor }}
                      />
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate font-medium">
                          {r.areaName}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {r.layerName}
                        </span>
                      </div>
                      <TypeTag>PLZ</TypeTag>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup heading="Gebiete">
              {areaMatches.map((a) => (
                <CommandItem
                  key={`area-${a.id}`}
                  value={`area-${a.id}`}
                  onSelect={() => go(`/postal-codes/${a.id}`)}
                  className={ITEM_CLASS}
                >
                  <IconFolder
                    className="size-4 shrink-0 text-muted-foreground"
                    stroke={2}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-medium">{a.name}</span>
                    {a.tags && a.tags.length > 0 && (
                      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <IconTag className="size-3 shrink-0" />
                        <span className="truncate">
                          {a.tags.map((t) => t.name).join(", ")}
                        </span>
                      </span>
                    )}
                  </div>
                  <TypeTag>
                    {(a.uniquePostalCodeCount ?? 0).toLocaleString("de-DE")} PLZ
                  </TypeTag>
                </CommandItem>
              ))}
            </CommandGroup>

            {onCreateArea && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Aktionen">
                  <CommandItem
                    value="neues-gebiet"
                    onSelect={() => {
                      onOpenChange(false);
                      onCreateArea();
                    }}
                    className={ITEM_CLASS}
                  >
                    <IconPlus
                      className="size-4 shrink-0 text-muted-foreground"
                      stroke={2}
                    />
                    <span className="font-medium">Neues Gebiet erstellen</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {plzCandidate && plzResults.length === 0 && (
              <>
                <CommandSeparator />
                <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                  <IconMapPin className="size-3.5 shrink-0" />
                  PLZ {plzCandidate} ist keinem Gebiet zugeordnet.
                </div>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
