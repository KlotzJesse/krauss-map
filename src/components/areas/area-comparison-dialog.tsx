"use client";

import {
  IconArrowsExchange,
  IconChartBar,
  IconLayersIntersect,
  IconLoader2,
  IconMapPin,
} from "@tabler/icons-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  type AreaComparisonResult,
  getAreaComparisonAction,
} from "@/app/actions/area-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AreaSummary } from "@/lib/types/area-types";
import { cn } from "@/lib/utils";

interface AreaComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: AreaSummary[];
  defaultAreaId?: number;
}

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "text-center px-2 py-2 rounded-md",
        highlight && "bg-primary/5"
      )}
    >
      <div
        className={cn(
          "text-xl font-bold tabular-nums",
          highlight && "text-primary"
        )}
      >
        {typeof value === "number" ? value.toLocaleString("de-DE") : value}
      </div>
      <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
        {label}
      </div>
    </div>
  );
}

function LayerBar({
  layer,
  max,
}: {
  layer: { name: string; color: string; postalCodeCount: number };
  max: number;
}) {
  const pct = max > 0 ? (layer.postalCodeCount / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className="inline-block w-2 h-2 rounded-sm shrink-0 border border-black/10"
        style={{ backgroundColor: layer.color }}
      />
      <span className="truncate flex-1 text-foreground/80 max-w-[120px]">
        {layer.name}
      </span>
      <div className="flex items-center gap-1.5 shrink-0 w-28">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: layer.color }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">
          {layer.postalCodeCount.toLocaleString("de-DE")}
        </span>
      </div>
    </div>
  );
}

export function AreaComparisonDialog({
  open,
  onOpenChange,
  areas,
  defaultAreaId,
}: AreaComparisonDialogProps) {
  const [areaIdA, setAreaIdA] = useState<string>(
    defaultAreaId?.toString() ?? ""
  );
  const [areaIdB, setAreaIdB] = useState<string>("");
  const [result, setResult] = useState<AreaComparisonResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeAreas = areas.filter((a) => a.isArchived !== "true");

  const handleCompare = () => {
    if (!areaIdA || !areaIdB) {
      toast.warning("Bitte zwei Gebiete auswählen");
      return;
    }
    if (areaIdA === areaIdB) {
      toast.warning("Bitte zwei verschiedene Gebiete auswählen");
      return;
    }
    startTransition(async () => {
      const res = await getAreaComparisonAction(
        Number(areaIdA),
        Number(areaIdB)
      );
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        toast.error(res.error ?? "Vergleich fehlgeschlagen");
      }
    });
  };

  const handleSwap = () => {
    const tmp = areaIdA;
    setAreaIdA(areaIdB);
    setAreaIdB(tmp);
    setResult(null);
  };

  const maxLayerPlz = result
    ? Math.max(
        ...result.a.layers.map((l) => l.postalCodeCount),
        ...result.b.layers.map((l) => l.postalCodeCount),
        1
      )
    : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconChartBar className="h-4 w-4 text-primary" />
            Gebietsvergleich
          </DialogTitle>
        </DialogHeader>

        {/* Selector row */}
        <div className="flex items-center gap-2 mt-2">
          <Select
            value={areaIdA}
            onValueChange={(v) => {
              setAreaIdA(v ?? "");
              setResult(null);
            }}
          >
            <SelectTrigger className="flex-1 h-8 text-sm">
              <SelectValue placeholder="Gebiet A wählen…" />
            </SelectTrigger>
            <SelectContent>
              {activeAreas.map((a) => (
                <SelectItem key={a.id} value={a.id.toString()}>
                  {a.name}
                  {a.country && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({a.country.toUpperCase()})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={handleSwap}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Tauschen"
          >
            <IconArrowsExchange className="h-4 w-4" />
          </button>

          <Select
            value={areaIdB}
            onValueChange={(v) => {
              setAreaIdB(v ?? "");
              setResult(null);
            }}
          >
            <SelectTrigger className="flex-1 h-8 text-sm">
              <SelectValue placeholder="Gebiet B wählen…" />
            </SelectTrigger>
            <SelectContent>
              {activeAreas.map((a) => (
                <SelectItem key={a.id} value={a.id.toString()}>
                  {a.name}
                  {a.country && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({a.country.toUpperCase()})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={handleCompare}
            disabled={isPending || !areaIdA || !areaIdB}
          >
            {isPending && (
              <IconLoader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            )}
            Vergleichen
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-5 mt-3">
            {/* Stats comparison */}
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-foreground/80 truncate flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary shrink-0" />
                  {result.a.name}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <StatCell label="PLZ" value={result.a.totalPlz} />
                  <StatCell label="Layer" value={result.a.layers.length} />
                </div>
                {result.a.country && (
                  <div className="text-[10px] text-muted-foreground text-center uppercase font-mono">
                    {result.a.country} · {result.a.granularity ?? "–"}
                  </div>
                )}
                <Link
                  href={`/postal-codes/${result.a.id}`}
                  className="block text-center text-[11px] text-primary hover:underline"
                >
                  Öffnen →
                </Link>
              </div>

              <div className="border rounded-lg p-3 flex flex-col items-center justify-center gap-3 bg-muted/20">
                <div className="space-y-1 text-center">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground justify-center">
                    <IconMapPin className="h-3 w-3 text-orange-500" />
                    <span>Überschneidung</span>
                  </div>
                  <div className="text-2xl font-bold text-orange-500 tabular-nums">
                    {result.overlapCount.toLocaleString("de-DE")}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    PLZ in beiden
                  </div>
                </div>

                <div className="w-full space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block shrink-0" />
                    <span className="text-muted-foreground">nur A:</span>
                    <span className="font-medium tabular-nums ml-auto">
                      {result.onlyInA.toLocaleString("de-DE")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block shrink-0" />
                    <span className="text-muted-foreground">nur B:</span>
                    <span className="font-medium tabular-nums ml-auto">
                      {result.onlyInB.toLocaleString("de-DE")}
                    </span>
                  </div>
                </div>

                {/* Overlap Venn-like bar */}
                {(result.a.totalPlz > 0 || result.b.totalPlz > 0) && (
                  <div className="w-full">
                    <div className="relative h-2 rounded-full overflow-hidden bg-muted">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/60 rounded-l-full"
                        style={{
                          width: `${(result.a.totalPlz / Math.max(result.a.totalPlz, result.b.totalPlz)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="relative h-2 rounded-full overflow-hidden bg-muted mt-0.5">
                      <div
                        className="absolute inset-y-0 left-0 bg-blue-500/60 rounded-l-full"
                        style={{
                          width: `${(result.b.totalPlz / Math.max(result.a.totalPlz, result.b.totalPlz)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-3 space-y-2">
                <div className="text-xs font-semibold text-foreground/80 truncate flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  {result.b.name}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <StatCell label="PLZ" value={result.b.totalPlz} />
                  <StatCell label="Layer" value={result.b.layers.length} />
                </div>
                {result.b.country && (
                  <div className="text-[10px] text-muted-foreground text-center uppercase font-mono">
                    {result.b.country} · {result.b.granularity ?? "–"}
                  </div>
                )}
                <Link
                  href={`/postal-codes/${result.b.id}`}
                  className="block text-center text-[11px] text-primary hover:underline"
                >
                  Öffnen →
                </Link>
              </div>
            </div>

            {/* Layer breakdown */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <IconLayersIntersect className="h-3.5 w-3.5" />
                  Layer — {result.a.name}
                </h4>
                {result.a.layers.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Keine Layer
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {result.a.layers.map((l) => (
                      <LayerBar key={l.id} layer={l} max={maxLayerPlz} />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <IconLayersIntersect className="h-3.5 w-3.5" />
                  Layer — {result.b.name}
                </h4>
                {result.b.layers.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Keine Layer
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {result.b.layers.map((l) => (
                      <LayerBar key={l.id} layer={l} max={maxLayerPlz} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* PLZ code diff */}
            {(result.overlapCodes.length > 0 ||
              result.onlyInACodes.length > 0 ||
              result.onlyInBCodes.length > 0) && (
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-3">
                  PLZ-Vergleich (bis 200 je Kategorie)
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {result.onlyInACodes.length > 0 && (
                    <div>
                      <div className="text-[10px] font-medium text-primary mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                        Nur in A ({result.onlyInACodes.length}
                        {result.onlyInA > result.onlyInACodes.length ? "+" : ""}
                        )
                      </div>
                      <div className="flex flex-wrap gap-0.5 max-h-32 overflow-y-auto">
                        {result.onlyInACodes.map((code) => (
                          <span
                            key={code}
                            className="text-[10px] font-mono bg-primary/10 text-primary rounded px-1 py-0.5 leading-none"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.overlapCodes.length > 0 && (
                    <div>
                      <div className="text-[10px] font-medium text-orange-600 mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                        In beiden ({result.overlapCodes.length}
                        {result.overlapCount > result.overlapCodes.length
                          ? "+"
                          : ""}
                        )
                      </div>
                      <div className="flex flex-wrap gap-0.5 max-h-32 overflow-y-auto">
                        {result.overlapCodes.map((code) => (
                          <span
                            key={code}
                            className="text-[10px] font-mono bg-orange-100 text-orange-700 rounded px-1 py-0.5 leading-none"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.onlyInBCodes.length > 0 && (
                    <div>
                      <div className="text-[10px] font-medium text-blue-600 mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                        Nur in B ({result.onlyInBCodes.length}
                        {result.onlyInB > result.onlyInBCodes.length ? "+" : ""}
                        )
                      </div>
                      <div className="flex flex-wrap gap-0.5 max-h-32 overflow-y-auto">
                        {result.onlyInBCodes.map((code) => (
                          <span
                            key={code}
                            className="text-[10px] font-mono bg-blue-100 text-blue-700 rounded px-1 py-0.5 leading-none"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
