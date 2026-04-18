"use client";

import { IconMapPin, IconSearch, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { useEffect } from "react";
import { useDebounce } from "use-debounce";

import {
  searchPostalCodeInAreasAction,
  type PlzSearchResult,
} from "@/app/actions/area-actions";
import { SidebarInput } from "@/components/ui/sidebar";

export function PlzSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlzSearchResult[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [debouncedQuery] = useDebounce(query, 350);

  useEffect(() => {
    const code = debouncedQuery.trim();
    if (code.length < 2) {
      setResults([]);
      setNotFound(false);
      return;
    }
    startTransition(async () => {
      const res = await searchPostalCodeInAreasAction(code);
      if (res.success) {
        setResults(res.data ?? []);
        setNotFound((res.data ?? []).length === 0);
      }
    });
  }, [debouncedQuery]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setNotFound(false);
  }, []);

  return (
    <div className="relative px-2 pb-1">
      <div className="relative">
        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <SidebarInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="PLZ suchen…"
          className="pl-8 pr-7 h-7 text-xs"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {(results.length > 0 || notFound) && (
        <div className="mt-1 rounded-md border bg-popover shadow-sm text-xs overflow-hidden">
          {notFound && !isPending && (
            <div className="px-3 py-2 text-muted-foreground">
              Nicht gefunden
            </div>
          )}
          {results.map((r) => (
            <Link
              key={`${r.areaId}-${r.layerId}`}
              href={`/postal-codes/${r.areaId}`}
              onClick={handleClear}
              className="flex items-start gap-2 px-3 py-2 hover:bg-accent transition-colors"
            >
              <span
                className="mt-0.5 h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: r.layerColor }}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{r.areaName}</div>
                <div className="text-muted-foreground truncate flex items-center gap-1">
                  <IconMapPin className="h-3 w-3 shrink-0" />
                  {r.layerName}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
