"use client";

import { useState, useTransition, useOptimistic } from "react";
import { toast } from "sonner";

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
      try {
        // Optimistically show creating state INSIDE transition
        updateOptimisticCreating(true);

        // Server action handles redirect automatically
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

        // These lines won't execute if redirect happens (which is expected)
        setName("");
        setDescription("");
        setGranularity("5digit");
        onOpenChange(false);
      } catch (error) {
        // Only catch real errors, not NEXT_REDIRECT
        if (
          error &&
          typeof error === "object" &&
          "digest" in error &&
          typeof error.digest === "string" &&
          error.digest.startsWith("NEXT_REDIRECT")
        ) {
          // This is a redirect, not an error - let it propagate
          throw error;
        }
        // Only log actual errors
        console.error("Error creating area:", error);
        updateOptimisticCreating(false);
      }
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
                items={{
                  "1digit": "1-stellig",
                  "2digit": "2-stellig",
                  "3digit": "3-stellig",
                  "5digit": "5-stellig",
                }}
              >
                <SelectTrigger id="granularity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1digit">1-stellig</SelectItem>
                  <SelectItem value="2digit">2-stellig</SelectItem>
                  <SelectItem value="3digit">3-stellig</SelectItem>
                  <SelectItem value="5digit">5-stellig</SelectItem>
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
