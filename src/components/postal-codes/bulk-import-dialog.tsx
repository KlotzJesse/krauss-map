"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Layers,
  MapPin,
} from "lucide-react";
import { useCallback, useState, useOptimistic, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { bulkImportPostalCodesAndLayers } from "@/app/actions/bulk-import-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useExcelImport } from "@/lib/hooks/use-excel-import";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaId: number;
  onImportComplete?: () => void;
}

export function BulkImportDialog({
  open,
  onOpenChange,
  areaId,
  onImportComplete,
}: BulkImportDialogProps) {
  const {
    fileData,
    columnMapping,
    layerGroups,
    stats,
    isProcessing,
    error,
    loadFile,
    updateColumnMapping,
    reset,
  } = useExcelImport();

  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [_isPending, startTransition] = useTransition();

  // Optimistic import status
  const [_optimisticImportStatus, updateOptimisticImportStatus] = useOptimistic(
    { importing: false, progress: 0, completed: false },
    (
      _state,
      update: { importing?: boolean; progress?: number; completed?: boolean }
    ) => ({
      ..._state,
      ...update,
    })
  );

  // File drop handling
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      const file = acceptedFiles[0];

      // Validate file type
      const validTypes = [
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ];

      const validExtensions = [".xls", ".xlsx", ".csv"];
      const hasValidExtension = validExtensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );

      if (!validTypes.includes(file.type) && !hasValidExtension) {
        toast.error(
          "Ungültiges Format. Bitte Excel (.xlsx, .xls) oder CSV verwenden."
        );
        return;
      }

      await loadFile(file);
      toast.success(`"${file.name}" geladen`);
    },
    [loadFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: false,
    maxFiles: 1,
  });

  // Handle import
  const handleImport = useCallback(async () => {
    if (!stats || stats.validRows === 0 || !layerGroups.length) {
      toast.error("Keine Daten zum Importieren");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    startTransition(async () => {
      // Optimistically show import starting
      updateOptimisticImportStatus({
        importing: true,
        progress: 0,
        completed: false,
      });

      // Prepare layers for bulk import
      const layers = layerGroups.map((group) => ({
        name: group.layerName,
        postalCodes: group.postalCodes,
      }));

      // Optimistically update progress
      updateOptimisticImportStatus({
        importing: true,
        progress: 50,
        completed: false,
      });

      try {
        await executeAction(bulkImportPostalCodesAndLayers(areaId, layers), {
          loading: `Importiere ${layers.length} Gebiete...`,
          success: (data) => {
            if (data.success) {
              setImportProgress(100);
              updateOptimisticImportStatus({
                importing: false,
                progress: 100,
                completed: true,
              });
              reset();
              onOpenChange(false);
              onImportComplete?.();
              return `Import erfolgreich! ${data.createdLayers} neue Layer, ${data.updatedLayers} aktualisiert, ${data.totalPostalCodes} PLZ hinzugefügt.`;
            }
            throw new Error(data.errors?.join(", ") || "Unbekannter Fehler");
          },
          error: (err) =>
            `Import fehlgeschlagen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
        });
      } catch (error) {
        console.error(error);
      }
      setIsImporting(false);
      setImportProgress(0);
      updateOptimisticImportStatus({
        importing: false,
        progress: 0,
        completed: false,
      });
    });
  }, [
    stats,
    layerGroups,
    areaId,
    reset,
    onOpenChange,
    onImportComplete,
    updateOptimisticImportStatus,
  ]);

  // Clear and reset
  const handleClear = useCallback(() => {
    reset();
  }, [reset]);

  const handleClose = useCallback(() => {
    if (!isImporting) {
      reset();
      onOpenChange(false);
    }
  }, [isImporting, reset, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Excel/CSV-Import
          </DialogTitle>
          <DialogDescription>
            Excel (.xlsx, .xls) oder CSV hochladen. Format: "12345" oder
            "D-12345".
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {!fileData ? (
            // File upload area
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
                ${
                  isDragActive
                    ? "border-primary bg-primary/10"
                    : "border-muted-foreground/25 hover:border-primary/50"
                }
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-muted">
                  <Download className="h-12 w-12 text-muted-foreground" />
                </div>
                {isDragActive ? (
                  <p className="text-lg">Datei hier ablegen...</p>
                ) : (
                  <>
                    <p className="text-lg font-medium">
                      Datei hierher ziehen oder klicken
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Excel (.xlsx, .xls), CSV (.csv)
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            // File loaded - show column mapping and preview
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Column mapping */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    PLZ-Spalte
                  </Label>
                  <Select
                    value={columnMapping.postalCodeColumn || ""}
                    onValueChange={(value) =>
                      updateColumnMapping({ postalCodeColumn: value || null })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Spalte wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fileData.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Layer (optional)
                  </Label>
                  <Select
                    value={columnMapping.layerColumn || "none"}
                    onValueChange={(value) =>
                      updateColumnMapping({
                        layerColumn: value === "none" ? null : value,
                      })
                    }
                    items={{
                      none: "Keine (Standard)",
                      ...Object.fromEntries(
                        fileData.headers.map((h) => [h, h])
                      ),
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Keine (Standard)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine (Standard)</SelectItem>
                      {fileData.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Statistics */}
              {stats && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {stats.validRows} gültig
                  </Badge>
                  {stats.invalidRows > 0 && (
                    <Badge
                      variant="destructive"
                      className="flex items-center gap-1"
                    >
                      <AlertCircle className="h-3 w-3" />
                      {stats.invalidRows} ungültig
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    {stats.uniquePostalCodes} eindeutige PLZ
                  </Badge>
                  <Badge variant="secondary">{stats.uniqueLayers} Layer</Badge>
                </div>
              )}

              {/* Preview table */}
              <div className="flex-1 overflow-hidden">
                <Label className="mb-2 block">Vorschau (erste 5 Zeilen)</Label>
                <ScrollArea className="h-[300px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {fileData.headers.map((header) => (
                          <TableHead key={header} className="font-medium">
                            {header}
                            {header === columnMapping.postalCodeColumn && (
                              <MapPin className="inline-block ml-1 h-3 w-3 text-primary" />
                            )}
                            {header === columnMapping.layerColumn && (
                              <Layers className="inline-block ml-1 h-3 w-3 text-primary" />
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fileData.rows.slice(0, 5).map((row, idx) => (
                        <TableRow key={`preview-${idx}`}>
                          {fileData.headers.map((header) => (
                            <TableCell key={header}>
                              {row[header]?.toString() || ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {/* Layer groups preview */}
              {layerGroups.length > 0 && (
                <div className="space-y-2">
                  <Label>Zu importierende Layer ({layerGroups.length})</Label>
                  <ScrollArea className="h-[120px] border rounded-lg p-3 bg-muted/30">
                    <div className="space-y-2">
                      {layerGroups.map((group, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {group.layerName}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {group.validCount} PLZ
                            </Badge>
                            {group.invalidCount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {group.invalidCount} ungültig
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Import progress */}
              {isImporting && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Importiere...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} />
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{error}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          <div>
            {fileData && (
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={isImporting || isProcessing}
              >
                Zurücksetzen
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isImporting || isProcessing}
            >
              Abbrechen
            </Button>
            {fileData && (
              <Button
                onClick={handleImport}
                disabled={
                  !stats ||
                  stats.validRows === 0 ||
                  isImporting ||
                  isProcessing ||
                  !columnMapping.postalCodeColumn
                }
              >
                {isImporting
                  ? "Importiere..."
                  : `${stats?.validRows || 0} PLZ in ${layerGroups.length} Layer`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
