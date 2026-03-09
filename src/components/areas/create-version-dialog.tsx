"use client";

import { IconDeviceFloppy } from "@tabler/icons-react";
import { useState, useOptimistic, useTransition } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { useVersionHistory } from "@/lib/hooks/use-version-history";

interface CreateVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaId: number;
  onVersionCreated?: () => void;
}

export function CreateVersionDialog({
  open,
  onOpenChange,
  areaId,
  onVersionCreated,
}: CreateVersionDialogProps) {
  const { createVersion } = useVersionHistory(areaId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [changesSummary, setChangesSummary] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Optimistic version creation state
  const [optimisticCreating, updateOptimisticCreating] = useOptimistic(
    false,
    (_state, creating: boolean) => creating
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    startTransition(async () => {
      // Optimistically show creating state
      updateOptimisticCreating(true);

      try {
        await createVersion({
          name: name || undefined,
          description: description || undefined,
          changesSummary: changesSummary || undefined,
        });

        setName("");
        setDescription("");
        setChangesSummary("");
        onOpenChange(false);
        onVersionCreated?.();
      } finally {
        setIsCreating(false);
        updateOptimisticCreating(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleCreate}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconDeviceFloppy className="h-5 w-5" />
              Version erstellen
            </DialogTitle>
            <DialogDescription>
              Snapshot des aktuellen Zustands aller Layer erstellen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="version-name">Name (optional)</Label>
              <Input
                id="version-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Vor Änderung Nord"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="version-description">
                Beschreibung (optional)
              </Label>
              <Textarea
                id="version-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Beschreibung..."
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="changes-summary">Änderungen (optional)</Label>
              <Textarea
                id="changes-summary"
                value={changesSummary}
                onChange={(e) => setChangesSummary(e.target.value)}
                placeholder="Was wurde geändert..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreating}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={isCreating || optimisticCreating || isPending}
            >
              {isCreating || optimisticCreating
                ? "Erstelle..."
                : "Version erstellen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
