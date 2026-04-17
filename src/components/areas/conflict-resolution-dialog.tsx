"use client";

import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconLoader,
  IconWand,
} from "@tabler/icons-react";
import { useState, useEffect, useCallback, Activity } from "react";

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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ConflictGroup } from "@/lib/hooks/use-layer-conflicts";
import { useLayerConflicts } from "@/lib/hooks/use-layer-conflicts";
import type { Layer } from "@/lib/types/area-types";
import { cn } from "@/lib/utils";
import { createToastCallbacks } from "@/lib/utils/action-state-callbacks/toast-callbacks";
import { withCallbacks } from "@/lib/utils/action-state-callbacks/with-callbacks";

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
  const { conflicts, conflictGroups, detectConflicts, isDetecting } =
    useLayerConflicts(layers);

  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState(0);

  useEffect(() => {
    if (open) {
      detectConflicts();
      setSelectedCodes(new Set());
      setExpandedGroups(new Set());
    }
  }, [open, detectConflicts]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const selectAllInGroup = (group: ConflictGroup) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      for (const code of group.postalCodes) {
        next.add(code);
      }
      return next;
    });
  };

  const deselectAllInGroup = (group: ConflictGroup) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      for (const code of group.postalCodes) {
        next.delete(code);
      }
      return next;
    });
  };

  const selectAll = () => {
    const allCodes = new Set<string>();
    for (const c of conflicts) {
      allCodes.add(c.postalCode);
    }
    setSelectedCodes(allCodes);
  };

  const deselectAll = () => {
    setSelectedCodes(new Set());
  };

  const isGroupFullySelected = (group: ConflictGroup) =>
    group.postalCodes.every((c) => selectedCodes.has(c));

  const isGroupPartiallySelected = (group: ConflictGroup) =>
    group.postalCodes.some((c) => selectedCodes.has(c)) &&
    !isGroupFullySelected(group);

  /**
   * Batch resolve: collect all removals per layer, then execute one updateLayerAction per affected layer.
   */
  const handleBatchResolve = useCallback(
    async (
      targetLayerId: number | "remove-all",
      codesToResolve: Set<string>
    ) => {
      if (codesToResolve.size === 0) return;
      setResolving(true);
      setResolveProgress(0);

      // Build removal map: layerId → set of codes to remove
      const removals = new Map<number, Set<string>>();
      for (const conflict of conflicts) {
        if (!codesToResolve.has(conflict.postalCode)) continue;

        for (const conflictLayer of conflict.layers) {
          if (
            targetLayerId === "remove-all" ||
            conflictLayer.id !== targetLayerId
          ) {
            const existing = removals.get(conflictLayer.id);
            if (existing) {
              existing.add(conflict.postalCode);
            } else {
              removals.set(conflictLayer.id, new Set([conflict.postalCode]));
            }
          }
        }
      }

      const totalOps = removals.size;
      let completed = 0;

      for (const [layerId, codesToRemove] of removals) {
        const layer = layers.find((l) => l.id === layerId);
        if (!layer) continue;

        const currentCodes =
          layer.postalCodes?.map((pc) => pc.postalCode) ?? [];
        const newCodes = currentCodes.filter((c) => !codesToRemove.has(c));

        if (newCodes.length < currentCodes.length) {
          await withCallbacks(
            () => updateLayerAction(areaId, layerId, { postalCodes: newCodes }),
            createToastCallbacks({
              loadingMessage: `Aktualisiere ${layer.name}...`,
              successMessage: `${codesToRemove.size} PLZ aus ${layer.name} entfernt`,
              errorMessage: `Fehler bei ${layer.name}`,
            })
          )();
        }

        completed++;
        setResolveProgress(Math.round((completed / totalOps) * 100));
      }

      setSelectedCodes(new Set());
      setResolving(false);
      setResolveProgress(0);
      detectConflicts();
    },
    [conflicts, layers, areaId, detectConflicts]
  );

  /** Auto-resolve: for each group, keep codes in the layer that has the most postal codes overall. */
  const handleAutoResolve = useCallback(async () => {
    const allConflictCodes = new Set(conflicts.map((c) => c.postalCode));
    // Find which layer has the most postal codes
    let bestLayer: Layer | null = null;
    let bestCount = -1;
    for (const layer of layers) {
      const count = layer.postalCodes?.length ?? 0;
      if (count > bestCount) {
        bestCount = count;
        bestLayer = layer;
      }
    }
    if (!bestLayer) return;
    await handleBatchResolve(bestLayer.id, allConflictCodes);
  }, [conflicts, layers, handleBatchResolve]);

  const selectedInGroup = (group: ConflictGroup) =>
    group.postalCodes.filter((c) => selectedCodes.has(c)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconAlertTriangle className="h-5 w-5 text-amber-500" />
            Konflikte auflösen
          </DialogTitle>
          <DialogDescription>
            Überlappende PLZ in verschiedenen Gebieten finden und beheben.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-3">
          {/* Scanning state */}
          <Activity mode={isDetecting ? "visible" : "hidden"}>
            <div className="flex items-center justify-center gap-2 p-8">
              <IconLoader className="h-5 w-5 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Scanne nach Konflikten...
              </span>
            </div>
          </Activity>

          {/* No conflicts */}
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

          {/* Conflicts found */}
          <Activity
            mode={!isDetecting && conflicts.length > 0 ? "visible" : "hidden"}
          >
            <div className="space-y-3">
              {/* Summary bar */}
              <div className="flex items-center justify-between gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  {conflicts.length} PLZ-Konflikt
                  {conflicts.length !== 1 ? "e" : ""} in {conflictGroups.length}{" "}
                  Gruppe
                  {conflictGroups.length !== 1 ? "n" : ""}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={
                      selectedCodes.size === conflicts.length
                        ? deselectAll
                        : selectAll
                    }
                  >
                    {selectedCodes.size === conflicts.length ? "Keine" : "Alle"}{" "}
                    auswählen
                  </Button>
                </div>
              </div>

              {/* Resolve progress */}
              <Activity mode={resolving ? "visible" : "hidden"}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IconLoader className="h-4 w-4 animate-spin" />
                    Konflikte werden aufgelöst...
                  </div>
                  <Progress value={resolveProgress} />
                </div>
              </Activity>

              {/* Grouped conflict list */}
              <ScrollArea className="max-h-[45vh]">
                <div className="space-y-2 pr-3">
                  {conflictGroups.map((group) => {
                    const isExpanded = expandedGroups.has(group.key);
                    const groupSelected = selectedInGroup(group);

                    return (
                      <div
                        key={group.key}
                        className="border rounded-lg overflow-hidden"
                      >
                        {/* Group header */}
                        <div className="flex items-center gap-2 p-2 bg-muted/50 hover:bg-muted transition-colors">
                          <Checkbox
                            checked={isGroupFullySelected(group)}
                            indeterminate={
                              !isGroupFullySelected(group) &&
                              isGroupPartiallySelected(group)
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                selectAllInGroup(group);
                              } else {
                                deselectAllInGroup(group);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="flex-1 flex items-center gap-2 text-left"
                            onClick={() => toggleGroup(group.key)}
                          >
                            {isExpanded ? (
                              <IconChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <IconChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              {group.layers.map((layer, i) => (
                                <span
                                  key={layer.id}
                                  className="flex items-center gap-1"
                                >
                                  {i > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      ↔
                                    </span>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className="text-xs px-1.5 py-0"
                                    style={{
                                      borderColor: layer.color,
                                      color: layer.color,
                                    }}
                                  >
                                    {layer.name}
                                  </Badge>
                                </span>
                              ))}
                            </div>
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                              {group.postalCodes.length} PLZ
                              {groupSelected > 0 && (
                                <span className="text-primary">
                                  {" "}
                                  ({groupSelected} ✓)
                                </span>
                              )}
                            </span>
                          </button>

                          {/* Inline group action */}
                          <GroupResolveDropdown
                            group={group}
                            layers={layers}
                            disabled={resolving}
                            onResolve={(targetLayerId) =>
                              handleBatchResolve(
                                targetLayerId,
                                new Set(group.postalCodes)
                              )
                            }
                          />
                        </div>

                        {/* Expanded postal code pills */}
                        {isExpanded && (
                          <div className="p-2 flex flex-wrap gap-1 border-t bg-background">
                            {group.postalCodes.map((code) => (
                              <button
                                key={code}
                                type="button"
                                onClick={() => toggleCode(code)}
                                className={cn(
                                  "px-2 py-0.5 text-xs rounded-full border transition-colors cursor-pointer",
                                  selectedCodes.has(code)
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                                )}
                              >
                                {code}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </Activity>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={resolving}
          >
            Schließen
          </Button>
          <Button
            onClick={() => detectConflicts()}
            variant="secondary"
            disabled={isDetecting || resolving}
          >
            {isDetecting ? (
              <>
                <IconLoader className="h-4 w-4 mr-1 animate-spin" />
                Scannen...
              </>
            ) : (
              "Neu scannen"
            )}
          </Button>
          <Activity mode={conflicts.length > 0 ? "visible" : "hidden"}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    onClick={handleAutoResolve}
                    disabled={resolving || isDetecting}
                  >
                    <IconWand className="h-4 w-4 mr-1" />
                    Auto
                  </Button>
                }
              />
              <TooltipContent>
                Alle Konflikte automatisch auflösen — PLZ im größten Gebiet
                behalten
              </TooltipContent>
            </Tooltip>
          </Activity>
          <Activity mode={selectedCodes.size > 0 ? "visible" : "hidden"}>
            <SelectedResolveDropdown
              selectedCount={selectedCodes.size}
              layers={layers}
              disabled={resolving}
              onResolve={(targetLayerId) =>
                handleBatchResolve(targetLayerId, selectedCodes)
              }
            />
          </Activity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact dropdown for resolving an entire group inline. */
function GroupResolveDropdown({
  group,
  layers,
  disabled,
  onResolve,
}: {
  group: ConflictGroup;
  layers: Layer[];
  disabled: boolean;
  onResolve: (targetLayerId: number | "remove-all") => void;
}) {
  const [strategy, setStrategy] = useState("");

  const handleChange = (value: string | null) => {
    if (!value) return;
    setStrategy(value);
    if (value === "remove-all") {
      onResolve("remove-all");
    } else {
      const layerId = Number.parseInt(value, 10);
      if (!Number.isNaN(layerId)) {
        onResolve(layerId);
      }
    }
    setStrategy("");
  };

  return (
    <Select value={strategy} onValueChange={handleChange}>
      <SelectTrigger
        className="h-7 w-auto min-w-[110px] text-xs gap-1"
        disabled={disabled}
      >
        <SelectValue placeholder="Auflösen →" />
      </SelectTrigger>
      <SelectContent>
        {group.layers.map((layer) => (
          <SelectItem key={layer.id} value={String(layer.id)}>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: layer.color }}
              />
              Behalten in {layer.name}
            </span>
          </SelectItem>
        ))}
        <SelectItem value="remove-all">Aus allen entfernen</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Dropdown for resolving selected postal codes across all groups. */
function SelectedResolveDropdown({
  selectedCount,
  layers,
  disabled,
  onResolve,
}: {
  selectedCount: number;
  layers: Layer[];
  disabled: boolean;
  onResolve: (targetLayerId: number | "remove-all") => void;
}) {
  const [strategy, setStrategy] = useState("");

  const handleChange = (value: string | null) => {
    if (!value) return;
    setStrategy(value);
    if (value === "remove-all") {
      onResolve("remove-all");
    } else {
      const layerId = Number.parseInt(value, 10);
      if (!Number.isNaN(layerId)) {
        onResolve(layerId);
      }
    }
    setStrategy("");
  };

  return (
    <Select value={strategy} onValueChange={handleChange}>
      <SelectTrigger className="h-9 w-auto gap-1" disabled={disabled}>
        <SelectValue placeholder={`${selectedCount} PLZ auflösen →`} />
      </SelectTrigger>
      <SelectContent>
        {layers.map((layer) => (
          <SelectItem key={layer.id} value={String(layer.id)}>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: layer.color }}
              />
              Behalten in {layer.name}
            </span>
          </SelectItem>
        ))}
        <SelectItem value="remove-all">Aus allen entfernen</SelectItem>
      </SelectContent>
    </Select>
  );
}
