"use client";

import { IconChevronDown } from "@tabler/icons-react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { removePostalCodesByCountryAction } from "@/app/actions/layer-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Layer } from "@/lib/types/area-types";
import { storedCodeToCompositeKey } from "@/lib/utils/deck-gl-utils";

const COUNTRY_META: Record<string, { flag: string; name: string }> = {
  DE: { flag: "🇩🇪", name: "Deutschland" },
  AT: { flag: "🇦🇹", name: "Österreich" },
  CH: { flag: "🇨🇭", name: "Schweiz" },
};

export interface LänderSectionProps {
  layers: Layer[];
  postalCodesData?: FeatureCollection<Polygon | MultiPolygon>;
  areaId?: number;
  onLayerUpdate?: () => void;
}

export function LänderSection({
  layers,
  postalCodesData,
  areaId,
  onLayerUpdate,
}: LänderSectionProps) {
  const [confirmCountry, setConfirmCountry] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const codeCountryMap = new Map<string, string>();
  const countryTotals = new Map<string, number>();
  for (const f of postalCodesData?.features ?? []) {
    const code = f.properties?.code as string | undefined;
    const c = f.properties?.country as string | undefined;
    if (c) countryTotals.set(c, (countryTotals.get(c) ?? 0) + 1);
    if (code && c && !codeCountryMap.has(code)) codeCountryMap.set(code, c);
  }

  const assignedSet = new Set(
    layers.flatMap((l) => l.postalCodes?.map((pc) => pc.postalCode) ?? [])
  );

  const countryAssigned = new Map<string, number>();
  for (const code of assignedSet) {
    // Use stored-format prefix for unambiguous country identification (e.g. "D-12345" → "DE")
    const composite = storedCodeToCompositeKey(code);
    const c = composite ? composite.split(":")[0] : codeCountryMap.get(code);
    if (c) countryAssigned.set(c, (countryAssigned.get(c) ?? 0) + 1);
  }

  const countryKeys = Object.keys(COUNTRY_META).filter(
    (c) => (countryTotals.get(c) ?? 0) > 0
  );

  if (countryKeys.length === 0) return null;

  const activeKeys = countryKeys.filter(
    (c) => (countryAssigned.get(c) ?? 0) > 0
  );
  const inactiveKeys = countryKeys.filter(
    (c) => (countryAssigned.get(c) ?? 0) === 0
  );

  const handleRemoveCountry = async (countryCode: string) => {
    if (!areaId) return;
    setIsRemoving(true);
    try {
      const result = await removePostalCodesByCountryAction(
        areaId,
        countryCode
      );
      if (result.success) {
        toast.success(
          `${result.data?.removed ?? 0} ${COUNTRY_META[countryCode]?.name ?? countryCode}-PLZ entfernt`
        );
        onLayerUpdate?.();
      } else {
        toast.error(result.error ?? "Fehler beim Entfernen");
      }
    } finally {
      setIsRemoving(false);
      setConfirmCountry(null);
    }
  };

  const renderCountryRow = (c: string) => {
    const meta = COUNTRY_META[c];
    const total = countryTotals.get(c) ?? 0;
    const assigned = countryAssigned.get(c) ?? 0;
    const inUse = assigned > 0;
    const coveragePct = total > 0 ? Math.round((assigned / total) * 100) : 0;
    return (
      <div key={c} className="flex items-center gap-1.5 rounded px-1 py-0.5">
        <span className="text-sm leading-none">{meta?.flag}</span>
        <span className="flex-1 truncate text-[10px] text-muted-foreground">
          {meta?.name ?? c}
        </span>
        {inUse ? (
          <>
            <span className="tabular-nums text-[10px] text-foreground">
              {assigned.toLocaleString("de-DE")}
              <span className="text-muted-foreground">
                /{total.toLocaleString("de-DE")}
              </span>
            </span>
            <span className="text-[9px] text-muted-foreground tabular-nums w-8 text-right shrink-0">
              {coveragePct}%
            </span>
            {areaId && (
              <button
                type="button"
                title={`Alle ${meta?.name ?? c}-PLZ aus allen Gebieten entfernen`}
                className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                onClick={() => setConfirmCountry(c)}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            )}
          </>
        ) : (
          <span className="text-[9px] text-muted-foreground italic">
            nicht verwendet
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-1 pt-1.5 pb-1">
        <div className="flex items-center justify-between py-0.5">
          <span className="text-xs font-semibold">Länder</span>
          {inactiveKeys.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowInactive((v) => !v)}
            >
              {showInactive
                ? `${inactiveKeys.length} inaktiv ausblenden`
                : `${inactiveKeys.length} inaktiv`}
              <IconChevronDown
                className={`size-2.5 transition-transform ${showInactive ? "rotate-0" : "-rotate-90"}`}
              />
            </button>
          )}
        </div>
        {activeKeys.map(renderCountryRow)}
        {showInactive && inactiveKeys.map(renderCountryRow)}
      </div>
      <AlertDialog
        open={confirmCountry !== null}
        onOpenChange={(v) => !v && setConfirmCountry(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {COUNTRY_META[confirmCountry ?? ""]?.flag}{" "}
              {COUNTRY_META[confirmCountry ?? ""]?.name}-PLZ entfernen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Alle{" "}
              {(countryAssigned.get(confirmCountry ?? "") ?? 0).toLocaleString(
                "de-DE"
              )}{" "}
              PLZ aus{" "}
              {COUNTRY_META[confirmCountry ?? ""]?.name ?? confirmCountry}{" "}
              werden aus allen Gebieten entfernt. Diese Aktion kann rückgängig
              gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemoving}
              onClick={() =>
                confirmCountry && handleRemoveCountry(confirmCountry)
              }
            >
              {isRemoving ? "Wird entfernt…" : "Entfernen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
