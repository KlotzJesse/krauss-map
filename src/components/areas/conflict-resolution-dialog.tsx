"use client";

import { IconAlertTriangle, IconCheck, IconLoader } from "@tabler/icons-react";
import { useState, useEffect, Activity } from "react";
import { toast } from "sonner";

import { updateLayerAction } from "@/app/actions/layer-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLayerConflicts } from "@/lib/hooks/use-layer-conflicts";
import type { Layer } from "@/lib/types/area-types";

interface ConflictResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaId: number;
  layers: Layer[];
}

export function ConflictResolutionDialog({
  open,
  onOpenChange,
  areaId,
  layers,
}: ConflictResolutionDialogProps) {
  const { conflicts, detectConflicts, isDetecting } = useLayerConflicts(layers);

  const [selectedConflicts, setSelectedConflicts] = useState<Set<string>>(
    new Set()
  );
  const [resolutionStrategy, setResolutionStrategy] = useState<string>("");

  // Automatically detect conflicts when dialog opens
  useEffect(() => {
    if (open) {
      detectConflicts();
    }
  }, [open, detectConflicts]);

  const handleDetect = () => {
    detectConflicts();
  };

  const handleResolve = async () => {
    if (!resolutionStrategy) {
      return;
    }

    const [action, targetLayerIdStr] = resolutionStrategy.split(":");
    const targetLayerId = parseInt(targetLayerIdStr, 10);

    for (const conflict of conflicts) {
      if (!selectedConflicts.has(conflict.postalCode)) {
        continue;
      }

      if (action === "keep") {
        // Remove postal code from all layers except target
        for (const layer of layers) {
          if (layer.id !== targetLayerId) {
            const currentCodes =
              layer.postalCodes?.map((pc) => pc.postalCode) || [];
            const newCodes = currentCodes.filter(
              (code) => code !== conflict.postalCode
            );
            if (currentCodes.length !== newCodes.length) {
              await toast.promise(
                updateLayerAction(areaId, layer.id, { postalCodes: newCodes }),
                {
                  loading: `Entferne ${conflict.postalCode} aus ${layer.name}...`,
                  success: `${conflict.postalCode} aus ${layer.name} entfernt`,
                  error: `Fehler beim Entfernen aus ${layer.name}`,
                }
              );
            }
          }
        }
      } else if (action === "remove-all") {
        // Remove from all layers
        for (const layer of layers) {
          const currentCodes =
            layer.postalCodes?.map((pc) => pc.postalCode) || [];
          const newCodes = currentCodes.filter(
            (code) => code !== conflict.postalCode
          );
          if (currentCodes.length !== newCodes.length) {
            await toast.promise(
              updateLayerAction(areaId, layer.id, { postalCodes: newCodes }),
              {
                loading: `Entferne ${conflict.postalCode} aus ${layer.name}...`,
                success: `${conflict.postalCode} aus ${layer.name} entfernt`,
                error: `Fehler beim Entfernen aus ${layer.name}`,
              }
            );
          }
        }
      }
    }

    setSelectedConflicts(new Set());
    handleDetect(); // Refresh conflicts
  };

  const toggleConflict = (postalCode: string) => {
    const newSet = new Set(selectedConflicts);
    if (newSet.has(postalCode)) {
      newSet.delete(postalCode);
    } else {
      newSet.add(postalCode);
    }
    setSelectedConflicts(newSet);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Konflikte auflösen</DialogTitle>
          <DialogDescription>
            Finden und beheben Sie überlappende Postleitzahlen in verschiedenen
            Layern.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Activity mode={isDetecting ? "visible" : "hidden"}>
            <div className="flex items-center justify-center gap-2 p-8">
              <IconLoader className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Scanne nach Konflikten...
              </span>
            </div>
          </Activity>
          <Activity
            mode={!isDetecting && conflicts.length === 0 ? "visible" : "hidden"}
          >
            <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <IconCheck className="h-5 w-5 text-green-600" />
              <span className="text-sm text-green-700 dark:text-green-300">
                Keine Konflikte gefunden
              </span>
            </div>
          </Activity>
          <Activity
            mode={!isDetecting && conflicts.length > 0 ? "visible" : "hidden"}
          >
            <>
              <div className="flex items-center gap-2 p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
                <IconAlertTriangle className="h-5 w-5 text-amber-600" />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  {conflicts.length} Konflikt{conflicts.length !== 1 ? "e" : ""}{" "}
                  gefunden
                </span>
              </div>

              <div className="space-y-2">
                {conflicts.map((conflict) => (
                  <div
                    key={conflict.postalCode}
                    className="flex items-start gap-3 p-3 border rounded-lg"
                  >
                    <Checkbox
                      checked={selectedConflicts.has(conflict.postalCode)}
                      onCheckedChange={() =>
                        toggleConflict(conflict.postalCode)
                      }
                    />
                    <div className="flex-1 space-y-1">
                      <div className="font-medium">{conflict.postalCode}</div>
                      <div className="flex flex-wrap gap-1">
                        {conflict.layers.map((layer) => (
                          <Badge
                            key={layer.id}
                            style={{
                              backgroundColor: layer.color,
                              color: "#fff",
                            }}
                          >
                            {layer.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Activity
                mode={selectedConflicts.size > 0 ? "visible" : "hidden"}
              >
                <div className="space-y-2">
                  <Label>Auflösungsstrategie</Label>
                  <Select
                    value={resolutionStrategy}
                    onValueChange={setResolutionStrategy}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Strategie wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {layers.map((layer) => (
                        <SelectItem key={layer.id} value={`keep:${layer.id}`}>
                          Behalten in: {layer.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="remove-all:0">
                        Aus allen Layern entfernen
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Activity>
            </>
          </Activity>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          <Button
            onClick={handleDetect}
            variant="secondary"
            disabled={isDetecting}
          >
            {isDetecting ? (
              <>
                <IconLoader className="h-4 w-4 mr-2 animate-spin" />
                Scannen...
              </>
            ) : (
              "Neu scannen"
            )}
          </Button>
          <Activity mode={selectedConflicts.size > 0 ? "visible" : "hidden"}>
            <Button
              onClick={handleResolve}
              disabled={!resolutionStrategy || isDetecting}
            >
              {selectedConflicts.size} Konflikt
              {selectedConflicts.size !== 1 ? "e" : ""} auflösen
            </Button>
          </Activity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
