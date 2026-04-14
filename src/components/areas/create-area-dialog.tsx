"use client";

import { useState, useTransition, useOptimistic } from "react";

import { createAreaAction } from "@/app/actions/area-actions";
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
import { Textarea } from "@/components/ui/textarea";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";
import { ALL_GRANULARITY_OPTIONS } from "@/lib/utils/granularity-utils";

interface CreateAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAreaDialog({
  open,
  onOpenChange,
}: CreateAreaDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [granularity, setGranularity] = useState("5digit");

  // Optimistic creating state
  const [optimisticCreating, updateOptimisticCreating] = useOptimistic(
    false,
    (_state, creating: boolean) => creating
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      updateOptimisticCreating(true);

      // Server action handles redirect on success.
      await executeAction(
        createAreaAction({
          name,
          description,
          granularity,
          createdBy: "user",
        }),
        {
          loading: `Erstelle Gebiet "${name}"...`,
          success: `Gebiet "${name}" erfolgreich erstellt`,
          error: "Fehler beim Erstellen des Gebiets",
        }
      );

      // Only reached if action didn't redirect (i.e. error path)
      setName("");
      setDescription("");
      setGranularity("5digit");
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Gebiet erstellen</DialogTitle>
            <DialogDescription>
              Gebiet mit mehreren Layern für PLZ-Bereiche erstellen.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Nordregion"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Beschreibung</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="granularity">PLZ-Granularität</Label>
              <Select
                value={granularity}
                onValueChange={(val) => val && setGranularity(val)}
                items={Object.fromEntries(
                  ALL_GRANULARITY_OPTIONS.map((opt) => [opt.value, opt.label])
                )}
              >
                <SelectTrigger id="granularity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_GRANULARITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending || optimisticCreating}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={isPending || optimisticCreating || !name}
            >
              {isPending || optimisticCreating ? "Erstelle..." : "Erstellen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
