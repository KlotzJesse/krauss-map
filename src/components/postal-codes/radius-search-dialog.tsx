"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type RadiusSearchMode = "straight" | "distance" | "time";

interface RadiusSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Centre of the search. Null while nothing has been picked. */
  coords: [number, number] | null;
  granularity: string;
  onStraightRadius: (
    coords: [number, number],
    radius: number,
    granularity: string
  ) => void | Promise<void>;
  performDrivingRadiusSearch?: (
    coords: [number, number],
    radius: number,
    granularity: string,
    mode: "distance" | "time",
    method: "osrm" | "approximation"
  ) => Promise<unknown>;
}

const MODES: {
  id: RadiusSearchMode;
  title: string;
  badge: string;
  badgeClass: string;
  hint: string;
}[] = [
  {
    id: "straight",
    title: "Luftlinie",
    badge: "Schnell",
    badgeClass:
      "bg-green-500/10 text-green-700 dark:text-green-400",
    hint: "Direkte Entfernung (wie der Vogel fliegt)",
  },
  {
    id: "distance",
    title: "Fahrstrecke (km)",
    badge: "Präzise",
    badgeClass: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    hint: "Tatsächliche Straßenentfernung",
  },
  {
    id: "time",
    title: "Fahrzeit (min)",
    badge: "Realistisch",
    badgeClass: "bg-purple-100 text-purple-700",
    hint: "Geschätzte Fahrtdauer",
  },
];

const modeLabel = (mode: RadiusSearchMode) =>
  mode === "straight"
    ? "Luftlinie"
    : mode === "distance"
      ? "Fahrstrecke"
      : "Fahrzeit";

/**
 * Radius selection around a point, by straight line, driving distance or
 * driving time.
 *
 * Lifted out of the map's address field when the search moved into the command
 * palette — the palette opens this rather than embedding the whole flow, since
 * mode, presets and a free numeric entry do not fit a command list.
 */
export function RadiusSearchDialog({
  open,
  onOpenChange,
  coords,
  granularity,
  onStraightRadius,
  performDrivingRadiusSearch,
}: RadiusSearchDialogProps) {
  const [searchMode, setSearchMode] = useState<RadiusSearchMode>("distance");
  const [radiusInput, setRadiusInput] = useState("5");
  const [isRunning, setIsRunning] = useState(false);

  const unit = searchMode === "time" ? "min" : "km";

  const handleConfirm = async () => {
    if (!coords) {
      return;
    }
    const radius = Number.parseFloat(radiusInput);
    if (Number.isNaN(radius) || radius < 0.1 || radius > 1000) {
      toast.error(
        "Bitte geben Sie einen gültigen Radius zwischen 0.1 und 1000 ein"
      );
      return;
    }

    setIsRunning(true);
    try {
      if (searchMode === "straight") {
        await onStraightRadius(coords, radius, granularity);
        toast.success(`${radius}km Luftlinie erfolgreich ausgewählt`);
      } else {
        if (!performDrivingRadiusSearch) {
          throw new Error("Umkreissuche über Straßen ist nicht verfügbar");
        }
        await performDrivingRadiusSearch(
          coords,
          radius,
          granularity,
          searchMode,
          "osrm"
        );
        toast.success(
          `${radius}${unit} ${modeLabel(searchMode)} erfolgreich ausgewählt`
        );
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Umkreissuche fehlgeschlagen"
      );
    } finally {
      setIsRunning(false);
    }
  };

  const presets =
    searchMode === "time" ? [5, 15, 30, 45] : [1, 5, 10, 25];
  const extendedPresets =
    searchMode === "time" ? [60, 90, 120, 180] : [50, 75, 100, 150];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Umkreis auswählen</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Wählen Sie Art und Größe des Suchradius
          </p>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3">
            {MODES.map((mode) => (
              <Button
                key={mode.id}
                variant="outline"
                size="default"
                onClick={() => setSearchMode(mode.id)}
                className={`h-auto p-4 text-left flex flex-col items-start gap-1 transition-all ${
                  searchMode === mode.id
                    ? "border-primary ring-1 ring-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
                role="radio"
                aria-checked={searchMode === mode.id}
                tabIndex={0}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium">{mode.title}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ml-auto ${mode.badgeClass}`}
                  >
                    {mode.badge}
                  </span>
                </div>
                <span
                  className={`text-xs ${searchMode === mode.id ? "text-primary" : "text-muted-foreground"}`}
                >
                  {mode.hint}
                </span>
              </Button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">
                Häufige Werte für {modeLabel(searchMode)}
              </Label>
              <p className="text-xs text-muted-foreground">
                {searchMode === "straight"
                  ? "Direkte Entfernung in km"
                  : searchMode === "distance"
                    ? "Tatsächliche Straßenentfernung in km"
                    : "Realistische Fahrtdauer in Minuten"}
              </p>
            </div>
            {[presets, extendedPresets].map((row, index) => (
              <div className="grid grid-cols-4 gap-2" key={index}>
                {row.map((preset) => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    onClick={() => setRadiusInput(String(preset))}
                    className="text-xs font-medium"
                  >
                    {preset}
                    {unit}
                  </Button>
                ))}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="radius-input">
              Exakte Eingabe (0.1-1000{unit})
            </Label>
            <Input
              id="radius-input"
              type="number"
              min="0.1"
              max="1000"
              step="0.1"
              value={radiusInput}
              onChange={(event) => setRadiusInput(event.target.value)}
              placeholder="z.B. 75.5"
              className="w-full"
            />
            <div className="text-xs text-muted-foreground">
              Werte zwischen 0.1{unit} und 1000{unit} sind möglich
            </div>
          </div>
        </div>

        <div className="text-sm border-t pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Ausgewählter Radius:</span>
            <span className="font-medium text-foreground">
              {radiusInput}
              {unit}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Suchmethode:</span>
            <span className="font-medium text-foreground">
              {modeLabel(searchMode)}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleConfirm} disabled={isRunning || !coords}>
              {radiusInput}
              {unit} {modeLabel(searchMode)} auswählen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
