"use client";

import {
  IconAlertCircle,
  IconArrowBackUp,
  IconArrowForwardUp,
} from "@tabler/icons-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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

interface LayerData {
  id: number;
  areaId: number;
  name: string;
  color: string;
  opacity: number;
  isVisible: string;
  orderIndex: number;
}

interface ChangeDataWithLayer extends Record<string, unknown> {
  layer?: LayerData;
  postalCodes?: string[];
}

interface PreviousDataWithLayer extends Record<string, unknown> {
  layer?: LayerData;
  postalCodes?: string[];
}

interface ChangePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  change: {
    id: number;
    changeType: string;
    entityType: string;
    changeData: ChangeDataWithLayer;
    previousData: PreviousDataWithLayer;
    createdAt: string;
    createdBy: string | null;
  } | null;
  mode: "undo" | "redo";
  onConfirm: () => void;
  isLoading?: boolean;
}

export function ChangePreviewDialog({
  open,
  onOpenChange,
  change,
  mode,
  onConfirm,
  isLoading = false,
}: ChangePreviewDialogProps) {
  if (!change) {
    return null;
  }

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

  const getChangeDetailsContent = () => {
    switch (change.changeType) {
      case "create_layer": {
        return (
          <div className="space-y-2">
            <p className="text-sm">
              {mode === "undo" ? "Entfernt" : "Erstellt erneut"} Layer:{" "}
              <strong>{change.changeData?.layer?.name}</strong>
            </p>
            <div className="pl-4 space-y-1 text-sm text-muted-foreground">
              <div>Farbe: {change.changeData?.layer?.color}</div>
              <div>Deckkraft: {change.changeData?.layer?.opacity}%</div>
            </div>
          </div>
        );
      }

      case "update_layer": {
        return (
          <div className="space-y-2">
            <p className="text-sm font-medium">Layer-Eigenschaftsänderungen:</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">
                  {mode === "undo" ? "Wiederherstellen zu:" : "Ändern zu:"}
                </p>
                {Object.entries(
                  mode === "undo" ? change.previousData : change.changeData
                ).map(([key, value]) => (
                  <div key={key} className="pl-2">
                    {key}: <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      case "delete_layer": {
        return (
          <div className="space-y-2">
            <p className="text-sm">
              {mode === "undo" ? "Stellt wieder her" : "Löscht"} Layer:{" "}
              <strong>{change.previousData?.layer?.name}</strong>
            </p>
            {change.previousData?.postalCodes &&
              change.previousData.postalCodes.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Einschließlich {change.previousData.postalCodes.length}{" "}
                  Postleitzahlen
                </p>
              )}
          </div>
        );
      }

      case "add_postal_codes": {
        return (
          <div className="space-y-2">
            <p className="text-sm">
              {mode === "undo" ? "Entfernt" : "Fügt hinzu"}{" "}
              {change.changeData?.postalCodes?.length || 0} Postleitzahlen
            </p>
            {change.changeData?.postalCodes &&
            change.changeData.postalCodes.length > 0 &&
            change.changeData.postalCodes.length <= 10 ? (
              <div className="pl-4 text-sm text-muted-foreground">
                {change.changeData.postalCodes.map((code: string) => (
                  <div key={code}>{code}</div>
                ))}
              </div>
            ) : change.changeData?.postalCodes &&
              change.changeData.postalCodes.length > 10 ? (
              <p className="text-xs text-muted-foreground">
                Zu viele zum Anzeigen ({change.changeData.postalCodes.length}{" "}
                Codes)
              </p>
            ) : null}
          </div>
        );
      }

      case "remove_postal_codes": {
        return (
          <div className="space-y-2">
            <p className="text-sm">
              {mode === "undo" ? "Stellt wieder her" : "Entfernt"}{" "}
              {change.previousData?.postalCodes?.length || 0} Postleitzahlen
            </p>
            {change.previousData?.postalCodes &&
            change.previousData.postalCodes.length > 0 &&
            change.previousData.postalCodes.length <= 10 ? (
              <div className="pl-4 text-sm text-muted-foreground">
                {change.previousData.postalCodes.map((code: string) => (
                  <div key={code}>{code}</div>
                ))}
              </div>
            ) : change.previousData?.postalCodes &&
              change.previousData.postalCodes.length > 10 ? (
              <p className="text-xs text-muted-foreground">
                Zu viele zum Anzeigen ({change.previousData.postalCodes.length}{" "}
                Codes)
              </p>
            ) : null}
          </div>
        );
      }

      case "update_area": {
        return (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Gebiets-Eigenschaftsänderungen:
            </p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">
                  {mode === "undo" ? "Wiederherstellen zu:" : "Ändern zu:"}
                </p>
                {Object.entries(
                  mode === "undo" ? change.previousData : change.changeData
                ).map(([key, value]) => (
                  <div key={key} className="pl-2">
                    {key}: <strong>{String(value)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }

      default: {
        return (
          <p className="text-sm text-muted-foreground">
            Keine Vorschau verfügbar für diesen Änderungstyp
          </p>
        );
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "undo" ? (
              <IconArrowBackUp className="h-5 w-5" />
            ) : (
              <IconArrowForwardUp className="h-5 w-5" />
            )}
            {mode === "undo" ? "Rückgängig" : "Wiederholen"} Änderungsvorschau
          </DialogTitle>
          <DialogDescription>
            Überprüfen Sie die Änderungen, die angewendet werden
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline">
                {getChangeTypeLabel(change.changeType)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(change.createdAt).toLocaleString()}
              </span>
            </div>

            {change.createdBy && (
              <p className="text-sm text-muted-foreground">
                Von: {change.createdBy}
              </p>
            )}

            <div className="border rounded-lg p-4 bg-accent/5">
              {getChangeDetailsContent()}
            </div>

            <Alert>
              <IconAlertCircle className="h-4 w-4" />
              <AlertDescription>
                {mode === "undo"
                  ? "Dies macht die ausgewählte Änderung rückgängig. Sie können sie später wiederholen, falls nötig."
                  : "Dies wendet die zuvor rückgängig gemachte Änderung erneut an."}
              </AlertDescription>
            </Alert>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Abbrechen
          </Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                Verarbeitung...
              </>
            ) : (
              <>
                {mode === "undo" ? (
                  <IconArrowBackUp className="h-4 w-4 mr-2" />
                ) : (
                  <IconArrowForwardUp className="h-4 w-4 mr-2" />
                )}
                Bestätigen {mode === "undo" ? "Rückgängig" : "Wiederholen"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
