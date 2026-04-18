"use client";

import { ArrowRightLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listAreasForCopyAction } from "@/app/actions/area-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CopyLayerToAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceLayerName: string;
  currentAreaId: number;
  onConfirm: (targetAreaId: number, newName: string) => void;
  isPending?: boolean;
}

export function CopyLayerToAreaDialog({
  open,
  onOpenChange,
  sourceLayerName,
  currentAreaId,
  onConfirm,
  isPending = false,
}: CopyLayerToAreaDialogProps) {
  const [targetAreaId, setTargetAreaId] = useState<string>("");
  const [layerName, setLayerName] = useState(`${sourceLayerName} (Kopie)`);
  const [availableAreas, setAvailableAreas] = useState<
    { id: number; name: string }[]
  >([]);

  useEffect(() => {
    if (!open) return;
    setLayerName(`${sourceLayerName} (Kopie)`);
    setTargetAreaId("");
    listAreasForCopyAction().then((res) => {
      if (res.success && res.data) {
        setAvailableAreas(res.data.filter((a) => a.id !== currentAreaId));
      }
    });
  }, [open, sourceLayerName, currentAreaId]);

  const otherAreas = useMemo(
    () => availableAreas.filter((a) => a.id !== currentAreaId),
    [availableAreas, currentAreaId]
  );

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        setTargetAreaId("");
      }
      onOpenChange(v);
    },
    [onOpenChange]
  );

  const handleConfirm = useCallback(() => {
    const id = Number(targetAreaId);
    if (!id || !layerName.trim()) return;
    onConfirm(id, layerName.trim());
  }, [targetAreaId, layerName, onConfirm]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Ebene in anderes Gebiet kopieren
          </DialogTitle>
          <DialogDescription>
            Kopiert &quot;{sourceLayerName}&quot; mit all ihren PLZ in das
            gewählte Gebiet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="target-area">Zielgebiet</Label>
            {otherAreas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine anderen Gebiete vorhanden.
              </p>
            ) : (
              <Select
                value={targetAreaId}
                onValueChange={(value) => {
                  if (value !== null) setTargetAreaId(value);
                }}
              >
                <SelectTrigger id="target-area" className="w-full">
                  <SelectValue placeholder="Gebiet auswählen…" />
                </SelectTrigger>
                <SelectContent>
                  {otherAreas.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="layer-copy-name">Name der kopierten Ebene</Label>
            <Input
              id="layer-copy-name"
              value={layerName}
              onChange={(e) => setLayerName(e.target.value)}
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === "Enter" && targetAreaId && layerName.trim()) {
                  handleConfirm();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!targetAreaId || !layerName.trim() || isPending}
          >
            {isPending ? "Kopiert…" : "Kopieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
