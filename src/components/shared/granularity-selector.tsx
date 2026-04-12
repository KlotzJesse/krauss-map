"use client";

import { AlertTriangle, Info, Lock } from "lucide-react";
import {
  useState,
  useTransition,
  useOptimistic,
  Activity,
  useMemo,
} from "react";
import { toast } from "sonner";

import { changeAreaGranularityAction } from "@/app/actions/granularity-actions";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Layer } from "@/lib/types/area-types";
import { createToastCallbacks } from "@/lib/utils/action-state-callbacks/toast-callbacks";
import { withCallbacks } from "@/lib/utils/action-state-callbacks/with-callbacks";
import {
  GRANULARITY_OPTIONS,
  getGranularityLabel,
  isGranularityChangeCompatible,
  wouldGranularityChangeCauseDataLoss,
  getGranularityChangeDescription,
} from "@/lib/utils/granularity-utils";

const EMPTY_ARRAY: never[] = [];

function getSelectItemStatus(
  optionValue: string,
  currentGranularity: string,
  hasPostalCodes: boolean,
  totalPostalCodes: number
): "current" | "available" | "destructive" | "compatible" {
  if (optionValue === currentGranularity) {
    return "current";
  }
  if (!hasPostalCodes) {
    return "available";
  }

  const changeDescription = getGranularityChangeDescription(
    currentGranularity,
    optionValue,
    totalPostalCodes
  );

  return changeDescription.type === "destructive"
    ? "destructive"
    : changeDescription.type === "compatible"
      ? "compatible"
      : "available";
}

function getSelectItemTooltip(
  optionValue: string,
  currentGranularity: string,
  totalPostalCodes: number
): string {
  const changeDescription = getGranularityChangeDescription(
    currentGranularity,
    optionValue,
    totalPostalCodes
  );
  return changeDescription.description;
}
interface GranularitySelectorProps {
  currentGranularity: string;
  onGranularityChange: (granularity: string) => void;
  areaId?: number;
  layers?: Layer[];
}

function useGranularityActions({
  currentGranularity,
  areaId,
  hasPostalCodes,
  onGranularityChange,
}: {
  currentGranularity: string;
  areaId: number | undefined;
  hasPostalCodes: boolean;
  onGranularityChange: (granularity: string) => void;
}) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingGranularity, setPendingGranularity] = useState<string | null>(
    null
  );
  const [_isPending, startTransition] = useTransition();

  const [optimisticGranularity, updateOptimisticGranularity] = useOptimistic(
    currentGranularity,
    (_state, newGranularity: string) => newGranularity
  );

  const handleGranularitySelect = (newGranularity: string) => {
    if (newGranularity === currentGranularity) {
      return;
    }
    if (!areaId) {
      return;
    }

    if (!hasPostalCodes) {
      startTransition(async () => {
        const newLabel = getGranularityLabel(newGranularity);
        const action = withCallbacks(
          () =>
            changeAreaGranularityAction(
              areaId,
              newGranularity,
              currentGranularity
            ),
          createToastCallbacks({
            loadingMessage: `Wechsle zu ${newLabel}...`,
            successMessage: `Wechsel zu ${newLabel} erfolgreich`,
            errorMessage: "Fehler beim Ändern der Granularität",
          })
        );
        const result = await action();
        if (result?.success) {
          onGranularityChange(newGranularity);
        }
      });
      return;
    }

    if (
      wouldGranularityChangeCauseDataLoss(
        currentGranularity,
        newGranularity,
        hasPostalCodes
      )
    ) {
      setPendingGranularity(newGranularity);
      setShowConfirmDialog(true);
      return;
    }

    if (isGranularityChangeCompatible(currentGranularity, newGranularity)) {
      startTransition(async () => {
        updateOptimisticGranularity(newGranularity);
        const newLabel = getGranularityLabel(newGranularity);
        const action = withCallbacks(
          () =>
            changeAreaGranularityAction(
              areaId,
              newGranularity,
              currentGranularity
            ),
          createToastCallbacks({
            loadingMessage: `Wechsle zu ${newLabel} PLZ-Ansicht...`,
            successMessage: (data: unknown) => {
              const d = data as {
                success?: boolean;
                data?: { addedPostalCodes?: number; migratedLayers?: number };
              };
              if (d.success && d.data) {
                const { addedPostalCodes, migratedLayers } = d.data;
                return `Wechsel zu ${newLabel}: ${migratedLayers} Layer migriert, ${addedPostalCodes} Regionen hinzugefügt`;
              }
              return `Wechsel zu ${newLabel} erfolgreich`;
            },
            errorMessage: "Fehler beim Ändern der Granularität",
          })
        );
        const result = await action();
        if (result?.success && result.data) {
          onGranularityChange(newGranularity);
        }
      });
      return;
    }

    toast.error("Unerwarteter Fehler beim Ändern der Granularität");
  };

  const handleConfirmChange = async () => {
    if (!pendingGranularity || !areaId) {
      setShowConfirmDialog(false);
      setPendingGranularity(null);
      return;
    }
    const newLabel = getGranularityLabel(pendingGranularity);
    startTransition(async () => {
      const action = withCallbacks(
        () =>
          changeAreaGranularityAction(
            areaId,
            pendingGranularity,
            currentGranularity
          ),
        createToastCallbacks({
          loadingMessage: `Wechsle zu ${newLabel}...`,
          successMessage: (data: unknown) => {
            const d = data as {
              success?: boolean;
              data?: { removedPostalCodes?: number };
            };
            if (d.success && d.data) {
              return `Wechsel zu ${newLabel} erfolgreich: ${d.data.removedPostalCodes} Regionen entfernt`;
            }
            return `Wechsel zu ${newLabel} erfolgreich`;
          },
          errorMessage: "Fehler beim Ändern der Granularität",
        })
      );
      const result = await action();
      if (result?.success) {
        onGranularityChange(pendingGranularity);
      }
      setShowConfirmDialog(false);
      setPendingGranularity(null);
    });
  };

  return {
    showConfirmDialog,
    setShowConfirmDialog,
    pendingGranularity,
    optimisticGranularity,
    isPending: _isPending,
    handleGranularitySelect,
    handleConfirmChange,
  };
}

export function GranularitySelector({
  currentGranularity,
  onGranularityChange,
  areaId,
  layers = EMPTY_ARRAY,
}: GranularitySelectorProps) {
  const { totalPostalCodes, hasPostalCodes } = useMemo(() => {
    const total = layers.reduce(
      (acc, layer) => acc + (layer.postalCodes?.length || 0),
      0
    );
    return {
      totalPostalCodes: total,
      hasPostalCodes: total > 0,
    };
  }, [layers]);

  const {
    showConfirmDialog,
    setShowConfirmDialog,
    optimisticGranularity,
    handleGranularitySelect,
    handleConfirmChange,
    isPending,
  } = useGranularityActions({
    currentGranularity,
    areaId,
    hasPostalCodes,
    onGranularityChange,
  });

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Granularity Selector */}
        <Select
          value={optimisticGranularity}
          onValueChange={(val) => val && handleGranularitySelect(val)}
          disabled={isPending}
          items={Object.fromEntries(
            GRANULARITY_OPTIONS.map((opt) => [opt.value, opt.label])
          )}
        >
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue placeholder="Granularität wählen" />
          </SelectTrigger>
          <SelectContent>
            {GRANULARITY_OPTIONS.map((option) => {
              const status = getSelectItemStatus(
                option.value,
                currentGranularity,
                hasPostalCodes,
                totalPostalCodes
              );
              const tooltip = getSelectItemTooltip(
                option.value,
                currentGranularity,
                totalPostalCodes
              );

              return (
                <Tooltip key={option.value}>
                  <TooltipTrigger
                    render={
                      <SelectItem
                        value={option.value}
                        className={`
                        ${status === "current" ? "bg-accent" : ""}
                        ${status === "destructive" ? "text-destructive" : ""}
                        ${status === "compatible" ? "text-green-600" : ""}
                      `}
                      />
                    }
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{option.label}</span>
                      <div className="flex items-center gap-1 ml-2">
                        <Activity
                          mode={status === "current" ? "visible" : "hidden"}
                        >
                          <Badge variant="secondary" className="text-xs px-1">
                            Aktiv
                          </Badge>
                        </Activity>
                        <Activity
                          mode={status === "destructive" ? "visible" : "hidden"}
                        >
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                        </Activity>
                        <Activity
                          mode={status === "compatible" ? "visible" : "hidden"}
                        >
                          <Info className="h-3 w-3 text-green-600" />
                        </Activity>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">{tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </SelectContent>
        </Select>

        {/* Status Information */}
        <Activity mode={hasPostalCodes ? "visible" : "hidden"}>
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            <div className="flex items-center gap-1 mb-1">
              <Lock className="h-3 w-3" />
              <span className="font-medium">
                Gebiet hat {totalPostalCodes} Regionen
              </span>
            </div>
            <p>
              Wechsel zu höherer Granularität (→) ist kompatibel. Wechsel zu
              niedrigerer Granularität (←) löscht alle Regionen.
            </p>
          </div>
        </Activity>

        {/* Confirmation Dialog */}
        <AlertDialog
          open={showConfirmDialog}
          onOpenChange={setShowConfirmDialog}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Granularität ändern?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">
                  <strong>Achtung:</strong> Der Wechsel zu einer niedrigeren
                  Granularität wird
                  <span className="text-destructive font-medium">
                    {" "}
                    alle {totalPostalCodes} Regionen
                  </span>{" "}
                  aus allen Gebieten löschen.
                </span>
                <span className="block">
                  Die PLZ-Daten auf der Karte bleiben erhalten, aber Ihre
                  gespeicherten Gebietsauswahlen gehen verloren.
                </span>
                <span className="block text-sm text-muted-foreground">
                  Dieser Vorgang kann nicht rückgängig gemacht werden.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowConfirmDialog(false);
                }}
              >
                Abbrechen
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmChange}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Trotzdem wechseln
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
