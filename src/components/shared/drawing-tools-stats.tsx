"use client";

import { IconChevronDown } from "@tabler/icons-react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { Download } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import type { Layer } from "@/lib/types/area-types";
import { storedCodeToCompositeKey } from "@/lib/utils/deck-gl-utils";

export interface StatsSectionProps {
  layers: Layer[];
  postalCodesData?: FeatureCollection<Polygon | MultiPolygon>;
  onLayerSelect?: (layerId: number) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function StatsSection({
  layers,
  postalCodesData,
  onLayerSelect,
  open = true,
  onOpenChange,
}: StatsSectionProps) {
  const assignedSet = new Set(
    layers.flatMap((l) => l.postalCodes?.map((pc) => pc.postalCode) ?? [])
  );

  // Build per-country stats to compute activeTotalFeatures
  const codeCountryMap = new Map<string, string>();
  const countryTotals = new Map<string, number>();
  for (const f of postalCodesData?.features ?? []) {
    const code = f.properties?.code as string | undefined;
    const c = f.properties?.country as string | undefined;
    if (c) countryTotals.set(c, (countryTotals.get(c) ?? 0) + 1);
    if (code && c && !codeCountryMap.has(code)) codeCountryMap.set(code, c);
  }

  const countryAssigned = new Map<string, number>();
  for (const code of assignedSet) {
    // Use stored-format prefix for unambiguous country identification (e.g. "D-12345" → "DE")
    const composite = storedCodeToCompositeKey(code);
    const c = composite ? composite.split(":")[0] : codeCountryMap.get(code);
    if (c) countryAssigned.set(c, (countryAssigned.get(c) ?? 0) + 1);
  }

  const countriesInUse = new Set<string>();
  for (const [c, count] of countryAssigned) {
    if (count > 0) countriesInUse.add(c);
  }

  const activeTotalFeatures =
    countriesInUse.size > 0
      ? [...countriesInUse].reduce(
          (sum, c) => sum + (countryTotals.get(c) ?? 0),
          0
        )
      : 0;

  const assignedCount = assignedSet.size;
  const unassignedCount = Math.max(0, activeTotalFeatures - assignedCount);
  const coverage =
    activeTotalFeatures > 0 ? (assignedCount / activeTotalFeatures) * 100 : 0;

  // Build sorted layer sizes for bar chart (include full data for CSV)
  const layerSizes = layers
    .map((l) => {
      const codes = l.postalCodes?.map((pc) => pc.postalCode) ?? [];
      const sorted = [...codes].sort();
      return {
        id: l.id,
        name: l.name ?? `Layer ${l.id}`,
        count: codes.length,
        color: l.color ?? "#6366f1",
        notes: l.notes ?? "",
        minCode: sorted[0] ?? "",
        maxCode: sorted.at(-1) ?? "",
      };
    })
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...layerSizes.map((l) => l.count), 1);

  return (
    <>
      <Separator />
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-0.5 text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">Statistik</span>
            {!open && (
              <span className="text-muted-foreground text-xs">
                {coverage.toFixed(0)}% Abdeckung · {assignedCount} PLZ
              </span>
            )}
          </div>
          <IconChevronDown
            className={`text-muted-foreground size-3.5 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 pb-1 pt-1">
            {/* Coverage donut ring */}
            <div className="flex items-center gap-3">
              <svg
                width="52"
                height="52"
                viewBox="0 0 52 52"
                className="shrink-0"
                aria-hidden
              >
                <circle
                  cx="26"
                  cy="26"
                  r="20"
                  fill="none"
                  strokeWidth="5"
                  className="stroke-muted"
                />
                <circle
                  cx="26"
                  cy="26"
                  r="20"
                  fill="none"
                  strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - Math.min(coverage, 100) / 100)}`}
                  strokeLinecap="round"
                  className="stroke-primary transition-[stroke-dashoffset] duration-500"
                  transform="rotate(-90 26 26)"
                />
                <text
                  x="26"
                  y="25"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9.5"
                  fontWeight="bold"
                  className="fill-foreground"
                >
                  {coverage.toFixed(0)}%
                </text>
                <text
                  x="26"
                  y="34"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="6.5"
                  className="fill-muted-foreground"
                >
                  Abdeckung
                </text>
              </svg>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Zugewiesen</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {assignedCount.toLocaleString("de-DE")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Nicht zugeordnet</span>
                  <span
                    className={`tabular-nums font-medium ${unassignedCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
                  >
                    {unassignedCount.toLocaleString("de-DE")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Gesamt PLZ</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {activeTotalFeatures.toLocaleString("de-DE")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Gebiete</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {layers.length}
                  </span>
                </div>
              </div>
            </div>
            {layerSizes.length > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold text-muted-foreground">
                    Layer-Verteilung
                  </div>
                  <button
                    type="button"
                    className="text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                    title="Statistik als CSV exportieren"
                    aria-label="Statistik als CSV exportieren"
                    onClick={() => {
                      const total = layerSizes.reduce((s, l) => s + l.count, 0);
                      const header = "Layer;Farbe;PLZ;Anteil %;Von;Bis;Notizen";
                      const rows = layerSizes.map(
                        (l) =>
                          `${l.name};${l.color};${l.count};${total > 0 ? ((l.count / total) * 100).toFixed(1) : "0.0"};${l.minCode};${l.maxCode};"${(l.notes ?? "").replace(/"/g, '""')}"`
                      );
                      const csv = [header, ...rows].join("\n");
                      const blob = new Blob(["﻿" + csv], {
                        type: "text/csv;charset=utf-8;",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "statistik.csv";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download className="h-2.5 w-2.5" />
                    CSV
                  </button>
                </div>
                {layerSizes.map((layer) => (
                  <div key={layer.id} className="flex items-center gap-1.5">
                    <div
                      className="w-24 shrink-0 truncate text-[10px] text-muted-foreground"
                      title={layer.name}
                    >
                      {layer.name}
                    </div>
                    <div className="relative flex-1 h-3 rounded-sm bg-muted overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-300"
                        style={{
                          width: `${(layer.count / maxCount) * 100}%`,
                          backgroundColor: layer.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                    <div className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {layer.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
