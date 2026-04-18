"use client";

import { IconAlertTriangle, IconFolder } from "@tabler/icons-react";
import {
  ArrowDownAZ,
  ChevronDown,
  Filter,
  SortAsc,
  TrendingUp,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type OverviewArea = {
  id: number;
  name: string;
  country: string | null;
  postalCodeCount: number | null;
  uniquePostalCodeCount: number | null;
  totalPostalCodeCount: number | null;
  layerCount: number | null;
  conflictCount: number | null;
  updatedAt: Date | string | null;
};

type SortKey = "modified" | "name" | "coverage" | "plz";
type FilterKey = "all" | "conflicts" | "empty";

const SORT_LABELS: Record<SortKey, string> = {
  modified: "Zuletzt geändert",
  name: "Name A–Z",
  coverage: "Höchste Abdeckung",
  plz: "Meiste PLZ",
};

const PAGE_SIZE = 8;

export function OverviewAreaList({ areas }: { areas: OverviewArea[] }) {
  const [sort, setSort] = useState<SortKey>("modified");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showAll, setShowAll] = useState(false);

  const conflictCount = areas.filter((a) => (a.conflictCount ?? 0) > 0).length;
  const emptyCount = areas.filter(
    (a) => (a.uniquePostalCodeCount ?? 0) === 0
  ).length;

  const filtered = useMemo(() => {
    if (filter === "conflicts")
      return areas.filter((a) => (a.conflictCount ?? 0) > 0);
    if (filter === "empty")
      return areas.filter((a) => (a.uniquePostalCodeCount ?? 0) === 0);
    return areas;
  }, [areas, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sort) {
      case "name":
        return copy.sort((a, b) => a.name.localeCompare(b.name, "de"));
      case "coverage":
        return copy.sort((a, b) => {
          const aCov = a.totalPostalCodeCount
            ? (a.uniquePostalCodeCount ?? 0) / a.totalPostalCodeCount
            : 0;
          const bCov = b.totalPostalCodeCount
            ? (b.uniquePostalCodeCount ?? 0) / b.totalPostalCodeCount
            : 0;
          return bCov - aCov;
        });
      case "plz":
        return copy.sort(
          (a, b) =>
            (b.uniquePostalCodeCount ?? 0) - (a.uniquePostalCodeCount ?? 0)
        );
      default:
        return copy; // "modified" — DB already returns sorted by updatedAt desc
    }
  }, [filtered, sort]);

  const visible = showAll ? sorted : sorted.slice(0, PAGE_SIZE);
  const hasMore = sorted.length > PAGE_SIZE && !showAll;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Gebiete
            {filtered.length !== areas.length && (
              <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                ({filtered.length} von {areas.length})
              </span>
            )}
          </CardTitle>
          <Link
            href="/"
            className="text-xs text-muted-foreground font-normal hover:text-foreground transition-colors"
          >
            Alle anzeigen →
          </Link>
        </div>

        {/* Filter chips + sort */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {/* Filter chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {(["all", "conflicts", "empty"] as FilterKey[]).map((f) => {
              const labels: Record<FilterKey, string> = {
                all: "Alle",
                conflicts: `Konflikte${conflictCount > 0 ? ` (${conflictCount})` : ""}`,
                empty: `Leer${emptyCount > 0 ? ` (${emptyCount})` : ""}`,
              };
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFilter(f);
                    setShowAll(false);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors",
                    isActive
                      ? f === "conflicts"
                        ? "bg-amber-500/15 text-amber-600 border-amber-400/30"
                        : f === "empty"
                          ? "bg-muted text-muted-foreground border-border"
                          : "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted/50"
                  )}
                >
                  {f === "conflicts" && (
                    <IconAlertTriangle className="h-2.5 w-2.5" />
                  )}
                  {labels[f]}
                </button>
              );
            })}
          </div>

          {/* Sort selector */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 h-6 px-2 text-[11px] text-muted-foreground rounded-md hover:bg-accent transition-colors ml-auto">
              <SortAsc className="h-3 w-3" />
              {SORT_LABELS[sort]}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs w-48">
              {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(
                ([key, label]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => {
                      setSort(key);
                      setShowAll(false);
                    }}
                    className={cn(
                      "text-xs",
                      sort === key && "font-medium text-primary"
                    )}
                  >
                    {key === "modified" && (
                      <ArrowDownAZ className="h-3 w-3 mr-1.5 text-muted-foreground" />
                    )}
                    {key === "name" && (
                      <ArrowDownAZ className="h-3 w-3 mr-1.5 text-muted-foreground" />
                    )}
                    {key === "coverage" && (
                      <TrendingUp className="h-3 w-3 mr-1.5 text-muted-foreground" />
                    )}
                    {key === "plz" && (
                      <Filter className="h-3 w-3 mr-1.5 text-muted-foreground" />
                    )}
                    {label}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {visible.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            Keine Gebiete gefunden
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {visible.map((area) => {
                const totalPc = area.totalPostalCodeCount ?? 0;
                const assigned = area.uniquePostalCodeCount ?? 0;
                const coveragePct =
                  totalPc > 0
                    ? Math.min(100, Math.round((assigned / totalPc) * 100))
                    : null;
                const hasConflicts = (area.conflictCount ?? 0) > 0;
                const isEmpty = assigned === 0;

                return (
                  <li key={area.id}>
                    <Link
                      href={`/postal-codes/${area.id}` as Route}
                      className="flex items-center gap-3 py-2.5 hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors group"
                    >
                      <IconFolder
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          hasConflicts
                            ? "text-amber-500"
                            : isEmpty
                              ? "text-muted-foreground/40"
                              : "text-muted-foreground"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">
                            {area.name}
                          </span>
                          {isEmpty && (
                            <Badge className="text-[9px] px-1 py-0 h-3.5 bg-muted text-muted-foreground border-0 shrink-0">
                              Leer
                            </Badge>
                          )}
                        </div>
                        {coveragePct !== null && !isEmpty && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  coveragePct >= 80
                                    ? "bg-green-500"
                                    : coveragePct >= 50
                                      ? "bg-primary"
                                      : coveragePct >= 20
                                        ? "bg-amber-500"
                                        : "bg-muted-foreground/40"
                                )}
                                style={{ width: `${coveragePct}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
                              {coveragePct}%
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                        {hasConflicts && (
                          <Badge className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/15 text-amber-600 border-amber-400/30 gap-0.5 shrink-0">
                            <IconAlertTriangle className="h-2 w-2" />
                            {area.conflictCount}
                          </Badge>
                        )}
                        {area.country && (
                          <span className="uppercase font-mono">
                            {area.country}
                          </span>
                        )}
                        {!!assigned && (
                          <span className="bg-muted rounded px-1 py-0.5">
                            {assigned.toLocaleString("de")} PLZ
                          </span>
                        )}
                        {!!area.layerCount && (
                          <span className="bg-muted rounded px-1 py-0.5">
                            {area.layerCount}L
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 transition-colors mt-1 border-t border-border"
              >
                {sorted.length - PAGE_SIZE} weitere anzeigen…
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
