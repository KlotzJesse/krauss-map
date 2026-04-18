"use client";

import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconLoader,
  IconWand,
} from "@tabler/icons-react";
import { X } from "lucide-react";
import { useState, useEffect, useCallback, Activity } from "react";

import { updateLayerAction } from "@/app/actions/layer-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
import { isLightColor } from "@/lib/utils/layer-colors";

interface ConflictResolutionPanelProps {
  onClose: () => void;
  onHighlightCodes: (codes: Set<string> | null) => void;
  areaId: number;
  layers: Layer[];
  /** Country code for composite postal code keys (e.g. "DE"). */
  country?: string;
}

export function ConflictResolutionPanel({
  onClose,
  onHighlightCodes,
  areaId,
  layers,
  country,
}: ConflictResolutionPanelProps) {
  // Convert raw postal codes to composite keys for feature-index lookup
  const toCompositeSet = useCallback(
    (codes: Set<string>) => {
      if (!country) return codes;
      const composite = new Set<string>();
      for (const code of codes) {
        composite.add(`${country}:${code}`);
      }
      return composite;
    },
    [country]
  );
  const highlightCodes = useCallback(
    (codes: Set<string> | null) =>
      onHighlightCodes(codes ? toCompositeSet(codes) : null),
    [onHighlightCodes, toCompositeSet]
  );
  const { conflicts, conflictGroups, detectConflicts, isDetecting } =
    useLayerConflicts(layers);

  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);
  const [resolveProgress, setResolveProgress] = useState(0);

  useEffect(() => {
    detectConflicts();
    setSelectedCodes(new Set());
    setExpandedGroups(new Set());
  }, [detectConflicts]);

  // Clear highlights when panel unmounts
  useEffect(() => () => onHighlightCodes(null), [onHighlightCodes]);

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
    <Card className="flex flex-col max-h-full min-h-0 w-96">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <IconAlertTriangle className="h-4 w-4 text-amber-500" />
          Konflikte auflösen
        </CardTitle>
        <CardAction>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-y-auto space-y-2 text-xs">
        {/* Scanning state */}
        <Activity mode={isDetecting ? "visible" : "hidden"}>
          <div className="flex items-center justify-center gap-2 p-4">
            <IconLoader className="h-4 w-4 animate-spin" />
            <span className="text-muted-foreground">
              Scanne nach Konflikten...
            </span>
          </div>
        </Activity>

        {/* No conflicts */}
        <Activity
          mode={!isDetecting && conflicts.length === 0 ? "visible" : "hidden"}
        >
          <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded">
            <IconCheck className="h-4 w-4 text-green-600" />
            <span className="text-green-700 dark:text-green-300">
              Keine Konflikte gefunden
            </span>
          </div>
        </Activity>

        {/* Conflicts found */}
        <Activity
          mode={!isDetecting && conflicts.length > 0 ? "visible" : "hidden"}
        >
          <div className="space-y-2">
            {/* Summary bar */}
            <div className="flex items-center justify-between gap-1 p-2 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <span className="font-medium text-amber-700 dark:text-amber-300">
                {conflicts.length} Konflikt
                {conflicts.length !== 1 ? "e" : ""} in {conflictGroups.length}{" "}
                Gruppe
                {conflictGroups.length !== 1 ? "n" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-xs px-1"
                onClick={
                  selectedCodes.size === conflicts.length
                    ? deselectAll
                    : selectAll
                }
              >
                {selectedCodes.size === conflicts.length ? "Keine" : "Alle"}
              </Button>
            </div>

            {/* Resolve progress */}
            <Activity mode={resolving ? "visible" : "hidden"}>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <IconLoader className="h-3 w-3 animate-spin" />
                  Auflösen...
                </div>
                <Progress value={resolveProgress} />
              </div>
            </Activity>

            {/* Grouped conflict list */}
            <div className="space-y-1.5">
              {conflictGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.key);
                const groupSelected = selectedInGroup(group);
                const groupCodes = new Set(group.postalCodes);

                return (
                  <div
                    key={group.key}
                    className="border rounded overflow-hidden"
                    onMouseEnter={() => highlightCodes(groupCodes)}
                    onMouseLeave={() => highlightCodes(null)}
                  >
                    {/* Group header */}
                    <div className="flex flex-col gap-1 p-1.5 bg-muted/50 hover:bg-muted transition-colors">
                      {/* Top row: checkbox + layer names + count */}
                      <div className="flex items-center gap-1.5">
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
                          className="flex-1 flex items-center gap-1 text-left min-w-0"
                          onClick={() => toggleGroup(group.key)}
                        >
                          {isExpanded ? (
                            <IconChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <IconChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="flex items-center gap-1 flex-wrap min-w-0">
                            {group.layers.map((layer, i) => (
                              <span
                                key={layer.id}
                                className="flex items-center gap-0.5"
                              >
                                {i > 0 && (
                                  <span className="text-muted-foreground">
                                    ↔
                                  </span>
                                )}
                                <Badge
                                  className="px-1.5 py-0 text-[10px] leading-4 border-0 whitespace-nowrap"
                                  style={{
                                    backgroundColor: layer.color,
                                    color: isLightColor(layer.color)
                                      ? "#1a1a1a"
                                      : "#fff",
                                  }}
                                >
                                  {layer.name}
                                </Badge>
                              </span>
                            ))}
                          </div>
                          <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                            {group.postalCodes.length}
                            {groupSelected > 0 && (
                              <span className="text-primary">
                                {" "}
                                ({groupSelected}✓)
                              </span>
                            )}
                          </span>
                        </button>
                      </div>

                      {/* Bottom row: resolve dropdown */}
                      <div className="flex justify-end pl-6">
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
                    </div>

                    {/* Expanded postal code pills */}
                    {isExpanded && (
                      <div className="p-1.5 flex flex-wrap gap-0.5 border-t bg-background">
                        {group.postalCodes.map((code) => (
                          <button
                            key={code}
                            type="button"
                            onClick={() => toggleCode(code)}
                            onMouseEnter={() => highlightCodes(new Set([code]))}
                            onMouseLeave={() => highlightCodes(groupCodes)}
                            className={cn(
                              "px-1.5 py-0 text-[10px] rounded-full border transition-colors cursor-pointer",
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
          </div>
        </Activity>

        {/* Action buttons — compact row */}
        <div className="flex flex-wrap gap-1 pt-1">
          <Button
            onClick={() => detectConflicts()}
            variant="secondary"
            size="sm"
            className="h-6 text-xs"
            disabled={isDetecting || resolving}
          >
            {isDetecting ? (
              <>
                <IconLoader className="h-3 w-3 mr-1 animate-spin" />
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
                    size="sm"
                    className="h-6 text-xs"
                    onClick={handleAutoResolve}
                    disabled={resolving || isDetecting}
                  />
                }
              >
                <IconWand className="h-3 w-3 mr-1" />
                Auto
              </TooltipTrigger>
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
        </div>
      </CardContent>
    </Card>
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
      <SelectTrigger className="h-6 w-auto text-xs gap-1" disabled={disabled}>
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
