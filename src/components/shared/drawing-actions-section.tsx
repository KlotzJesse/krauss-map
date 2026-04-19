"use client";

import {
  Diamond,
  Download,
  FileArchive,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2Icon,
  Upload,
  X,
} from "lucide-react";
import { Activity } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";

const DRAWING_MODES = [
  "freehand",
  "circle",
  "rectangle",
  "polygon",
  "point",
  "linestring",
  "angled-rectangle",
] as const;

interface DrawingActionsSectionProps {
  currentMode: string | null;
  postalCodesData: unknown;
  activeLayerId?: number | null;
  areaId?: number;
  isFilling: boolean;
  onFillHoles: () => void;
  onClearAll: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
  onExportGeoJSON: () => void;
  onExportData: () => void;
  onExportZip: () => void;
  onImportData: () => void;
}

export function DrawingActionsSection({
  currentMode,
  postalCodesData,
  activeLayerId,
  areaId,
  isFilling,
  onFillHoles,
  onClearAll,
  onExportExcel,
  onExportPDF,
  onExportGeoJSON,
  onExportData,
  onExportZip,
  onImportData,
}: DrawingActionsSectionProps) {
  const isDrawingMode =
    currentMode !== null &&
    DRAWING_MODES.includes(currentMode as (typeof DRAWING_MODES)[number]);

  return (
    <>
      {isDrawingMode && (
        <>
          <Separator />
          <div className="space-y-1">
            <Button
              variant="destructive"
              size="sm"
              onClick={onClearAll}
              className="w-full h-7 text-xs"
            >
              <X className="h-3 w-3 mr-1.5" />
              Zeichnung löschen
            </Button>
            <Activity mode={!!(activeLayerId && areaId) ? "visible" : "hidden"}>
              <Button
                variant="secondary"
                size="sm"
                disabled={isFilling || !activeLayerId}
                onClick={onFillHoles}
                className="w-full h-7 text-xs"
              >
                {isFilling ? (
                  <Loader2Icon className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Diamond className="h-3 w-3 mr-1.5" />
                )}
                Löcher füllen
              </Button>
            </Activity>
          </div>
        </>
      )}
      <Activity mode={!!postalCodesData ? "visible" : "hidden"}>
        <>
          <Separator />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                />
              }
            >
              <Download className="h-3 w-3 mr-1.5" />
              Export / Import
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Exportieren
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={onExportExcel}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={onExportPDF}
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={onExportGeoJSON}
                >
                  <FileJson className="h-3.5 w-3.5 text-muted-foreground" />
                  GeoJSON (mit Geometrien)
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={onExportData}
                >
                  <FileJson className="h-3.5 w-3.5 text-muted-foreground" />
                  JSON (Backup)
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={onExportZip}
                >
                  <FileArchive className="h-3.5 w-3.5 text-muted-foreground" />
                  ZIP (alle Ebenen als CSV)
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Importieren
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={onImportData}
                >
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  Gebiet aus JSON importieren
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      </Activity>
    </>
  );
}
