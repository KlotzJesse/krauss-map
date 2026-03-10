"use client";

import { IconGitMerge } from "@tabler/icons-react";
import { useState, useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

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
import { useLayerMerge } from "@/lib/hooks/use-layer-merge";
import type { Layer } from "@/lib/types/area-types";

interface LayerMergeDialogProps {
  open: boolean;

  onOpenChange: (open: boolean) => void;

  areaId: number;

  layers: Layer[];

  onMergeComplete?: () => void;
}

export function LayerMergeDialog({
  open,

  onOpenChange,

  areaId,

  layers,

  onMergeComplete,
}: LayerMergeDialogProps) {
  const { mergeLayers } = useLayerMerge({
    areaId,

    layers,

    onLayerUpdate: onMergeComplete,
  });

  const [selectedLayers, setSelectedLayers] = useState<Set<number>>(new Set());

  const [targetLayerId, setTargetLayerId] = useState<string>("");

  const [strategy, setStrategy] = useState<
    "union" | "keep-target" | "keep-source"
  >("union");

  const [isMerging, setIsMerging] = useState(false);
  const [_isPending, startTransition] = useTransition();

  // Optimistic merge state
  const [optimisticLayers, updateOptimisticLayers] = useOptimistic(
    layers,
    (
      state,
      {
        targetId: _targetId,
        sourceIds,
      }: { targetId: number; sourceIds: number[] }
    ) => state.filter((layer) => !sourceIds.includes(layer.id))
  );

  const toggleLayer = (layerId: number) => {
    const newSet = new Set(selectedLayers);

    if (newSet.has(layerId)) {
      newSet.delete(layerId);
    } else {
      newSet.add(layerId);
    }

    setSelectedLayers(newSet);
  };

  const handleMerge = async () => {
    if (selectedLayers.size < 2 || !targetLayerId) {
      return;
    }

    setIsMerging(true);

    const targetId = parseInt(targetLayerId, 10);
    const sourceIds = [...selectedLayers].filter((id) => id !== targetId);

    startTransition(async () => {
      // Optimistically update layers (remove source layers)
      updateOptimisticLayers({ targetId, sourceIds });

        try {
          await executeAction(mergeLayers(sourceIds, targetId, strategy), {
            loading: `Führe ${sourceIds.length} Gebiete zusammen...`,
            success: `${sourceIds.length} Gebiete erfolgreich zusammengeführt`,
            error: "Fehler beim Zusammenführen der Gebiete",
          });

          setSelectedLayers(new Set());
          setTargetLayerId("");
          onOpenChange(false);
          if (onMergeComplete) {
            onMergeComplete();
          }
      } catch (error) {
        // err handled by executeAction
      } finally {
        setIsMerging(false);
      }
    });
  };

  const getPreviewStats = () => {
    if (!targetLayerId || selectedLayers.size < 2) {
      return null;
    }

    const targetId = parseInt(targetLayerId, 10);
    const targetLayer = layers.find((l) => l.id === targetId);

    const sourceLayers = layers.filter(
      (l) => selectedLayers.has(l.id) && l.id !== targetId
    );

    if (!targetLayer) {
      return null;
    }

    const targetCodes = new Set(
      targetLayer.postalCodes?.map((pc) => pc.postalCode) || []
    );

    const sourceCodes = new Set(
      sourceLayers.flatMap(
        (l) => l.postalCodes?.map((pc) => pc.postalCode) || []
      )
    );

    let resultCount = 0;

    if (strategy === "union") {
      resultCount = new Set([...targetCodes, ...sourceCodes]).size;
    } else if (strategy === "keep-target") {
      resultCount = targetCodes.size;
    } else {
      resultCount = targetCodes.size + sourceCodes.size;
    }

    return {
      targetCount: targetCodes.size,

      sourceCount: sourceCodes.size,

      resultCount,
    };
  };

  const stats = getPreviewStats();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconGitMerge className="h-5 w-5" />
            Layer zusammenführen
          </DialogTitle>
          <DialogDescription>
            Wählen Sie mehrere Layer und eine Zusammenführungsstrategie.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Layer selection */}
          <div className="space-y-2">
            <Label>Layer auswählen (mindestens 2)</Label>
            <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-lg p-2">
              {optimisticLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="flex items-center gap-3 p-2 hover:bg-accent rounded"
                >
                  <Checkbox
                    checked={selectedLayers.has(layer.id)}
                    onCheckedChange={() => toggleLayer(layer.id)}
                  />
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: layer.color }}
                  />
                  <span className="flex-1">{layer.name}</span>
                  <Badge variant="outline">
                    {layer.postalCodes?.length || 0} PLZ
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Target layer selection */}
          {selectedLayers.size >= 2 && (
            <div className="space-y-2">
              <Label>Ziel-Layer (behält Name und Farbe)</Label>
              <Select value={targetLayerId} onValueChange={(val) => val && setTargetLayerId(val)} items={Object.fromEntries([...selectedLayers].map(id => [id, layers.find(l => l.id.toString() === id.toString())?.name || id]))}>
                <SelectTrigger>
                  <SelectValue placeholder="Ziel-Layer wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {[...selectedLayers].map((layerId) => {
                    const layer = layers.find((l) => l.id === layerId);

                    if (!layer) {
                      return null;
                    }

                    return (
                      <SelectItem key={layer.id} value={layer.id.toString()}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded"
                            style={{ backgroundColor: layer.color }}
                          />
                          {layer.name}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Merge strategy */}
          {selectedLayers.size >= 2 && targetLayerId && (
            <div className="space-y-2">
              <Label>Strategie</Label>
              <Select value={strategy} onValueChange={(val) => val && setStrategy(val as any)} items={{ union: "Vereinigung (Union)", "keep-target": "Ziel behalten", "keep-source": "Beide behalten" }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="union">
                    <div className="space-y-1">
                      <div className="font-medium">Vereinigung (Union)</div>
                      <div className="text-xs text-muted-foreground">
                        Alle PLZ aus allen Layern kombinieren
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="keep-target">
                    <div className="space-y-1">
                      <div className="font-medium">Ziel behalten</div>
                      <div className="text-xs text-muted-foreground">
                        Nur PLZ vom Ziel-Layer behalten, Quellen entfernen
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="keep-source">
                    <div className="space-y-1">
                      <div className="font-medium">Beide behalten</div>
                      <div className="text-xs text-muted-foreground">
                        Ziel und Quellen behalten (mit Duplikaten möglich)
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Preview */}
          {stats && (
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="font-medium">Vorschau:</div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ziel-Layer PLZ:</span>
                  <span>{stats.targetCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Quell-Layer PLZ:
                  </span>
                  <span>{stats.sourceCount}</span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>Ergebnis PLZ:</span>
                  <span>{stats.resultCount}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isMerging}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleMerge}
            disabled={selectedLayers.size < 2 || !targetLayerId || isMerging}
          >
            {isMerging ? "Zusammenführen..." : "Gebiete zusammenführen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
