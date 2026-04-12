"use client";

import {
  IconClock,
  IconRestore,
  IconGitBranch,
  IconDelta,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { useState, useTransition, useOptimistic } from "react";

import {
  restoreVersionAction,
  compareVersionsAction,
} from "@/app/actions/version-actions";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { VersionSummary, ChangeSummary } from "@/lib/schema/schema";
import { createToastCallbacks } from "@/lib/utils/action-state-callbacks/toast-callbacks";
import { withCallbacks } from "@/lib/utils/action-state-callbacks/with-callbacks";

interface ComparisonResult {
  layersAdded: { name: string }[];

  layersRemoved: { name: string }[];

  layersModified: { name: string }[];

  postalCodesAdded: string[];

  postalCodesRemoved: string[];
}

interface EnhancedVersionHistoryDialogProps {
  open: boolean;

  onOpenChange: (open: boolean) => void;

  areaId: number;

  versions: VersionSummary[];

  changes: ChangeSummary[];
}

export function EnhancedVersionHistoryDialog({
  open,

  onOpenChange,

  areaId,

  versions,

  changes,
}: EnhancedVersionHistoryDialogProps) {
  const [selectedVersion, setSelectedVersion] = useState<VersionSummary | null>(
    null
  );

  const [compareVersion, setCompareVersion] = useState<VersionSummary | null>(
    null
  );

  const [comparison, setComparison] = useState<ComparisonResult | null>(null);

  const [isPending, startTransition] = useTransition();

  const [showRestoreDialog, setShowRestoreDialog] = useState(false);

  const [versionToRestore, setVersionToRestore] =
    useState<VersionSummary | null>(null);

  // Optimistic restore state
  const [_optimisticRestoring, updateOptimisticRestoring] = useOptimistic(
    false,
    (_state, restoring: boolean) => restoring
  );

  const handleRestore = (version: VersionSummary) => {
    setVersionToRestore(version);

    setShowRestoreDialog(true);
  };

  const confirmRestore = () => {
    if (!versionToRestore) {
      return;
    }

    startTransition(async () => {
      // Optimistically show restoring state
      updateOptimisticRestoring(true);

      const result = await withCallbacks(
        () =>
          restoreVersionAction(areaId, versionToRestore.versionNumber, {
            createBranch: true,
            branchName: `Restored from v${versionToRestore.versionNumber}`,
          }),
        createToastCallbacks({
          loadingMessage: `Stelle Version ${versionToRestore.versionNumber} wieder her...`,
          successMessage: `Version ${versionToRestore.versionNumber} wiederhergestellt`,
          errorMessage: "Fehler beim Wiederherstellen der Version",
        })
      )();

      if (result?.success) {
        onOpenChange(false);
        window.location.reload();
        setShowRestoreDialog(false);
        setVersionToRestore(null);
      }
      updateOptimisticRestoring(false);
    });
  };

  const handleCompare = async () => {
    if (!selectedVersion || !compareVersion) {
      return;
    }

    const data = await withCallbacks(
      () =>
        compareVersionsAction(
          selectedVersion.areaId,
          selectedVersion.versionNumber,
          compareVersion.areaId,
          compareVersion.versionNumber
        ),
      createToastCallbacks({
        loadingMessage: `Vergleiche Version ${selectedVersion.versionNumber} mit ${compareVersion.versionNumber}...`,
        successMessage: `Versionen erfolgreich verglichen`,
        errorMessage: "Fehler beim Vergleichen der Versionen",
      })
    )();

    if (data?.success && data?.data) {
      setComparison(data.data);
    }
  };

  const getChangeTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      create_layer: "Layer erstellt",

      update_layer: "Layer aktualisiert",

      delete_layer: "Layer gelöscht",

      add_postal_codes: "Postleitzahlen hinzugefügt",

      remove_postal_codes: "Postleitzahlen entfernt",

      update_area: "Gebiet aktualisiert",
    };

    return labels[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Versionshistorie & Änderungen</DialogTitle>
          <DialogDescription>
            Alle Versionen und detaillierte Änderungshistorie für dieses Gebiet
            anzeigen
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="versions" className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="versions">
              <IconClock className="h-4 w-4 mr-2" />
              Versionen ({versions.length})
            </TabsTrigger>
            <TabsTrigger value="changes">
              <IconDelta className="h-4 w-4 mr-2" />
              Änderungen ({changes.length})
            </TabsTrigger>
            <TabsTrigger value="compare" disabled={versions.length < 2}>
              <IconGitBranch className="h-4 w-4 mr-2" />
              Vergleichen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="versions" className="mt-4">
            <ScrollArea className="h-[500px] pr-4">
              {versions.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                  <IconClock className="h-12 w-12 mb-2" />
                  <p>Noch keine Versionen gespeichert</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div
                      key={version.versionNumber}
                      role="button"
                      tabIndex={0}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        selectedVersion?.versionNumber === version.versionNumber
                          ? "border-primary bg-accent"
                          : version.isActive === "true"
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/10"
                            : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedVersion(version)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedVersion(version);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">
                            v{version.versionNumber}
                          </Badge>
                          {version.isActive === "true" && (
                            <Badge variant="default" className="bg-blue-600">
                              Aktiv
                            </Badge>
                          )}
                          {version.branchName && (
                            <Badge variant="secondary">
                              <IconGitBranch className="h-3 w-3 mr-1" />
                              {version.branchName}
                            </Badge>
                          )}
                          {version.name && (
                            <span className="font-medium">{version.name}</span>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(version.createdAt), {
                            addSuffix: true,

                            locale: de,
                          })}
                        </span>
                      </div>

                      {version.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {version.description}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{version.changeCount} Änderungen</span>
                        <span>{version.layerCount} Layer</span>
                        {version.createdBy && (
                          <span>von {version.createdBy}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="changes" className="mt-4">
            <ScrollArea className="h-[500px] pr-4">
              {changes.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                  <IconDelta className="h-12 w-12 mb-2" />
                  <p>Noch keine Änderungen aufgezeichnet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {changes.map((change) => (
                    <div
                      key={`${change.areaId}-${
                        change.versionAreaId || "null"
                      }-${change.versionNumber || "null"}-${
                        change.sequenceNumber
                      }`}
                      className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <Badge variant="outline" className="text-xs">
                          {getChangeTypeLabel(change.changeType)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(change.createdAt), {
                            addSuffix: true,

                            locale: de,
                          })}
                        </span>
                      </div>
                      <div className="text-sm">
                        {change.changeType === "add_postal_codes" && (
                          <span>
                            Added {change.postalCodeCount} postal code(s)
                          </span>
                        )}
                        {change.changeType === "remove_postal_codes" && (
                          <span>
                            Removed {change.postalCodeCount} postal code(s)
                          </span>
                        )}
                        {change.changeType === "create_layer" && (
                          <span>Layer erstellt: {change.layerName}</span>
                        )}
                        {change.changeType === "update_layer" && (
                          <span>Layer-Eigenschaften aktualisiert</span>
                        )}
                        {change.changeType === "delete_layer" && (
                          <span>
                            Layer gelöscht: {change.previousLayerName}
                          </span>
                        )}
                        {change.createdBy && (
                          <span className="text-xs text-muted-foreground ml-2">
                            by {change.createdBy}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="compare" className="mt-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Erste Version
                  </label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={selectedVersion?.versionNumber || ""}
                    onChange={(e) => {
                      const version = versions.find(
                        (v) => v.versionNumber === Number(e.target.value)
                      );

                      setSelectedVersion(version || null);

                      setComparison(null);
                    }}
                  >
                    <option value="">Version auswählen</option>
                    {versions.map((v) => (
                      <option key={v.versionNumber} value={v.versionNumber}>
                        v{v.versionNumber} {v.name ? `- ${v.name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Zweite Version
                  </label>
                  <select
                    className="w-full p-2 border rounded-md"
                    value={compareVersion?.versionNumber || ""}
                    onChange={(e) => {
                      const version = versions.find(
                        (v) => v.versionNumber === Number(e.target.value)
                      );

                      setCompareVersion(version || null);

                      setComparison(null);
                    }}
                  >
                    <option value="">Version auswählen</option>
                    {versions.map((v) => (
                      <option key={v.versionNumber} value={v.versionNumber}>
                        v{v.versionNumber} {v.name ? `- ${v.name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                onClick={handleCompare}
                disabled={!selectedVersion || !compareVersion}
                className="w-full"
              >
                Versionen vergleichen
              </Button>

              {comparison && (
                <ScrollArea className="h-[400px] border rounded-lg p-4">
                  <div className="space-y-4">
                    {comparison.layersAdded &&
                      comparison.layersAdded.length > 0 && (
                        <div>
                          <h4 className="font-medium text-green-600 mb-2">
                            Layer hinzugefügt ({comparison.layersAdded.length})
                          </h4>
                          {comparison.layersAdded.map((layer, idx: number) => (
                            <div
                              key={`added-${layer.name}-${idx}`}
                              className="text-sm pl-4"
                            >
                              + {layer.name}
                            </div>
                          ))}
                        </div>
                      )}
                    {comparison.layersRemoved &&
                      comparison.layersRemoved.length > 0 && (
                        <div>
                          <h4 className="font-medium text-red-600 mb-2">
                            Layer entfernt ({comparison.layersRemoved.length})
                          </h4>
                          {comparison.layersRemoved.map(
                            (layer, idx: number) => (
                              <div
                                key={`removed-${layer.name}-${idx}`}
                                className="text-sm pl-4"
                              >
                                - {layer.name}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    {comparison.layersModified &&
                      comparison.layersModified.length > 0 && (
                        <div>
                          <h4 className="font-medium text-blue-600 mb-2">
                            Layer geändert ({comparison.layersModified.length})
                          </h4>
                          {comparison.layersModified.map(
                            (layer, idx: number) => (
                              <div
                                key={`modified-${layer.name}-${idx}`}
                                className="text-sm pl-4"
                              >
                                ~ {layer.name}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    <div className="pt-4 border-t">
                      <div className="text-sm space-y-1">
                        <div className="text-green-600">
                          +{comparison.postalCodesAdded?.length || 0}{" "}
                          Postleitzahlen hinzugefügt
                        </div>
                        <div className="text-red-600">
                          -{comparison.postalCodesRemoved?.length || 0}{" "}
                          Postleitzahlen entfernt
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          {selectedVersion && (
            <Button
              onClick={() => handleRestore(selectedVersion)}
              disabled={isPending || selectedVersion.isActive === "true"}
              className="gap-2"
            >
              <IconRestore className="h-4 w-4" />v
              {selectedVersion.versionNumber} wiederherstellen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Version wiederherstellen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie Version {versionToRestore?.versionNumber} wirklich
              wiederherstellen? Dies erstellt einen neuen Branch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowRestoreDialog(false)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>
              Wiederherstellen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
