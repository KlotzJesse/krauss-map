"use client";

import { GitMerge } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { mergeLayersAction } from "@/app/actions/layer-actions";
import { Button } from "@/components/ui/button";
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

interface MergeLayersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaId: number;
  sourceLayerId: number;
  sourceLayerName: string;
  otherLayers: { id: number; name: string }[];
  onSuccess: () => void;
}

export function MergeLayersDialog({
  open,
  onOpenChange,
  areaId,
  sourceLayerId,
  sourceLayerName,
  otherLayers,
  onSuccess,
}: MergeLayersDialogProps) {
  const [targetLayerId, setTargetLayerId] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) setTargetLayerId("");
  }, [open]);

  const handleMerge = useCallback(() => {
    const targetId = Number(targetLayerId);
    if (!targetId) return;
    startTransition(async () => {
      const result = await mergeLayersAction(areaId, sourceLayerId, targetId);
      if (result.success) {
        toast.success("Layer erfolgreich zusammengeführt");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.error ?? "Fehler beim Zusammenführen");
      }
    });
  }, [targetLayerId, areaId, sourceLayerId, onOpenChange, onSuccess]);

  const canMerge = !!targetLayerId && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" />
            Layer zusammenführen
          </DialogTitle>
          <DialogDescription>
            PLZs aus <strong>{sourceLayerName}</strong> werden in den Ziel-Layer
            übernommen. Der Quell-Layer wird danach gelöscht.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="merge-target">Ziel-Layer</Label>
            <Select
              value={targetLayerId}
              onValueChange={(v) => setTargetLayerId(v ?? "")}
              disabled={isPending}
            >
              <SelectTrigger id="merge-target" className="w-full">
                <SelectValue placeholder="Ziel-Layer auswählen…" />
              </SelectTrigger>
              <SelectContent>
                {otherLayers.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetLayerId && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <strong>{sourceLayerName}</strong> wird nach dem Zusammenführen
              dauerhaft gelöscht. Dieser Vorgang kann nicht rückgängig gemacht
              werden.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={handleMerge} disabled={!canMerge}>
            {isPending ? (
              "Zusammenführen…"
            ) : (
              <>
                <GitMerge className="h-3.5 w-3.5 mr-1.5" />
                Zusammenführen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
