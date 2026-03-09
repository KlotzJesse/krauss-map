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
import { type Layer } from "@/lib/types/area-types";
import {
  GRANULARITY_OPTIONS,
  getGranularityLabel,
  isGranularityChangeCompatible,
  wouldGranularityChangeCauseDataLoss,
  getGranularityChangeDescription,
} from "@/lib/utils/granularity-utils";

interface GranularitySelectorProps {
  currentGranularity: string;
  onGranularityChange: (granularity: string) => void;
  areaId?: number;
  layers?: Layer[];
}

export function GranularitySelector({
  currentGranularity,
  onGranularityChange,
  areaId,
  layers = [],
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

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingGranularity, setPendingGranularity] = useState<string | null>(
    null
  );
  const [_isPending, startTransition] = useTransition();

  // Optimistic granularity state
  const [optimisticGranularity, updateOptimisticGranularity] = useOptimistic(
    currentGranularity,
    (_state, newGranularity: string) => newGranularity
  );

  const handleGranularitySelect = (newGranularity: string) => {
    if (newGranularity === currentGranularity) return;
    if (!areaId) return;

    // If no postal codes, allow any change
    if (!hasPostalCodes) {
      startTransition(async () => {
        const newLabel = getGranularityLabel(newGranularity);

        await toast.promise(
          changeAreaGranularityAction(
            areaId,
            newGranularity,
            currentGranularity
          ),
          {
            loading: `Wechsle zu ${newLabel}...`,
            success: (data) => {
              if (data.success) {
                onGranularityChange(newGranularity);
                return `Wechsel zu ${newLabel} erfolgreich`;
              }
              throw new Error(
                data.error || "Fehler beim Ändern der Granularität"
              );
            },
            error: "Fehler beim Ändern der Granularität",
          }
        );
      });
      return;
    }

    // Check if change would cause data loss
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

    // If compatible change (upgrade), show info and proceed with migration
    if (isGranularityChangeCompatible(currentGranularity, newGranularity)) {
      startTransition(async () => {
        // Optimistically update granularity
        updateOptimisticGranularity(newGranularity);
        const newLabel = getGranularityLabel(newGranularity);

        await toast.promise(
          changeAreaGranularityAction(
            areaId,
            newGranularity,
            currentGranularity
          ).then((data) => {
            if (data.success && data.data) {
              onGranularityChange(newGranularity);
            }
            return data;
          }),
          {
            loading: `Wechsle zu ${newLabel} PLZ-Ansicht...`,
            success: (data) => {
              if (data.success && data.data) {
                const { addedPostalCodes, migratedLayers } = data.data;
                return `Wechsel zu ${newLabel}: ${migratedLayers} Layer migriert, ${addedPostalCodes} Regionen hinzugefügt`;
              }
              throw new Error(
                data.error || "Fehler beim Ändern der Granularität"
              );
            },
            error: "Fehler beim Ändern der Granularität",
          }
        );
      });
      return;
    }

    // Fallback
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
      await toast.promise(
        changeAreaGranularityAction(
          areaId,
          pendingGranularity,
          currentGranularity
        ).then((data) => {
          if (data.success) {
            onGranularityChange(pendingGranularity);
          }
          return data;
        }),
        {
          loading: `Wechsle zu ${newLabel}...`,
          success: (data) => {
            if (data.success && data.data) {
              const { removedPostalCodes } = data.data;
              return `Wechsel zu ${newLabel} erfolgreich: ${removedPostalCodes} Regionen entfernt`;
            }
            throw new Error(
              data.error || "Fehler beim Ändern der Granularität"
            );
          },
          error: "Fehler beim Ändern der Granularität",
        }
      );

      setShowConfirmDialog(false);
      setPendingGranularity(null);
    });
  };

  const getSelectItemStatus = (optionValue: string) => {
    if (optionValue === currentGranularity) return "current";
    if (!hasPostalCodes) return "available";

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
  };

  const getSelectItemTooltip = (optionValue: string, _status: string) => {
    const changeDescription = getGranularityChangeDescription(
      currentGranularity,
      optionValue,
      totalPostalCodes
    );

    return changeDescription.description;
  };

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {/* Granularity Selector */}
        <Select
          value={optimisticGranularity}
          onValueChange={handleGranularitySelect}
          disabled={_isPending}
        >
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue placeholder="Granularität wählen" />
          </SelectTrigger>
          <SelectContent>
            {GRANULARITY_OPTIONS.map((option) => {
              const status = getSelectItemStatus(option.value);
              const tooltip = getSelectItemTooltip(option.value, status);

              return (
                <Tooltip key={option.value}>
                  <TooltipTrigger asChild>
                    <SelectItem
                      value={option.value}
                      className={`
                        ${status === "current" ? "bg-accent" : ""}
                        ${status === "destructive" ? "text-destructive" : ""}
                        ${status === "compatible" ? "text-green-600" : ""}
                      `}
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
                            mode={
                              status === "destructive" ? "visible" : "hidden"
                            }
                          >
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                          </Activity>
                          <Activity
                            mode={
                              status === "compatible" ? "visible" : "hidden"
                            }
                          >
                            <Info className="h-3 w-3 text-green-600" />
                          </Activity>
                        </div>
                      </div>
                    </SelectItem>
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
                <div>
                  <strong>Achtung:</strong> Der Wechsel zu einer niedrigeren
                  Granularität wird
                  <span className="text-destructive font-medium">
                    {" "}
                    alle {totalPostalCodes} Regionen
                  </span>{" "}
                  aus allen Gebieten löschen.
                </div>
                <div>
                  Die PLZ-Daten auf der Karte bleiben erhalten, aber Ihre
                  gespeicherten Gebietsauswahlen gehen verloren.
                </div>
                <div className="text-sm text-muted-foreground">
                  Dieser Vorgang kann nicht rückgängig gemacht werden.
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowConfirmDialog(false);
                  setPendingGranularity(null);
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
