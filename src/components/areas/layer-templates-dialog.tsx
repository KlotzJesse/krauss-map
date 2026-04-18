"use client";

import { BookTemplate, Check, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteLayerTemplateAction,
  getLayerTemplatesAction,
  saveLayerTemplateAction,
  applyLayerTemplateAction,
} from "@/app/actions/area-actions";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { SelectLayerTemplates } from "@/lib/schema/schema";

interface TemplateLayer {
  name: string;
  color: string;
  opacity: number;
  orderIndex: number;
  notes?: string | null;
}

interface LayerTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaId: number;
  /** Current layers (name, color) for the "save as template" preview */
  currentLayers: Array<{
    name: string;
    color: string;
    opacity: number;
    orderIndex: number;
    notes?: string | null;
  }>;
  onApplied?: () => void;
}

export function LayerTemplatesDialog({
  open,
  onOpenChange,
  areaId,
  currentLayers,
  onApplied,
}: LayerTemplatesDialogProps) {
  const [templates, setTemplates] = useState<SelectLayerTemplates[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [isSaving, startSaving] = useTransition();
  const [isApplying, startApplying] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<SelectLayerTemplates | null>(
    null
  );
  const [applyTarget, setApplyTarget] = useState<SelectLayerTemplates | null>(
    null
  );
  const [isDeleting, startDeleting] = useTransition();

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    const result = await getLayerTemplatesAction();
    if (result.success && result.data) setTemplates(result.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (open) loadTemplates();
  }, [open, loadTemplates]);

  const handleSave = () => {
    if (!saveName.trim()) return;
    startSaving(async () => {
      const result = await saveLayerTemplateAction(
        areaId,
        saveName.trim(),
        saveDescription.trim() || undefined
      );
      if (result.success) {
        toast.success("Vorlage gespeichert");
        setSaveName("");
        setSaveDescription("");
        await loadTemplates();
      } else {
        toast.error(result.error ?? "Fehler beim Speichern");
      }
    });
  };

  const handleApply = () => {
    if (!applyTarget) return;
    startApplying(async () => {
      const result = await applyLayerTemplateAction(applyTarget.id, areaId);
      if (result.success) {
        toast.success(`Vorlage "${applyTarget.name}" angewendet`);
        setApplyTarget(null);
        onApplied?.();
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Fehler beim Anwenden");
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startDeleting(async () => {
      const result = await deleteLayerTemplateAction(deleteTarget.id);
      if (result.success) {
        toast.success("Vorlage gelöscht");
        setDeleteTarget(null);
        await loadTemplates();
      } else {
        toast.error(result.error ?? "Fehler beim Löschen");
      }
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookTemplate className="h-4 w-4" />
              Ebenen-Vorlagen
            </DialogTitle>
            <DialogDescription>
              Speichere die aktuelle Ebenenstruktur als Vorlage oder wende eine
              gespeicherte Vorlage auf dieses Gebiet an.
            </DialogDescription>
          </DialogHeader>

          {/* Save current as template */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Aktuelle Struktur speichern
            </p>
            {currentLayers.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Keine Ebenen vorhanden
              </p>
            ) : (
              <div className="flex flex-wrap gap-1 mb-2">
                {currentLayers.map((l, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                    style={{ borderColor: l.color, color: l.color }}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    {l.name}
                  </span>
                ))}
              </div>
            )}
            <Input
              placeholder="Vorlagenname…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="h-7 text-xs"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <Input
              placeholder="Beschreibung (optional)…"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              className="h-7 text-xs"
              maxLength={200}
            />
            <Button
              size="sm"
              className="h-7 text-xs w-full"
              onClick={handleSave}
              disabled={
                !saveName.trim() || currentLayers.length === 0 || isSaving
              }
            >
              <Plus className="h-3 w-3 mr-1" />
              Als Vorlage speichern
            </Button>
          </div>

          <Separator />

          {/* Saved templates */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Gespeicherte Vorlagen
            </p>
            {isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                Lädt…
              </p>
            ) : templates.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 italic">
                Noch keine Vorlagen gespeichert
              </p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {templates.map((t) => {
                  const layers = t.layers as TemplateLayer[];
                  return (
                    <div
                      key={t.id}
                      className="flex items-start gap-2 p-2 rounded-md border hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {t.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {layers.map((l, i) => (
                            <span
                              key={i}
                              className="w-3 h-3 rounded-full flex-shrink-0 border border-white/30"
                              style={{ backgroundColor: l.color }}
                              title={l.name}
                            />
                          ))}
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1 py-0 h-3 ml-1"
                          >
                            {layers.length} Ebene
                            {layers.length !== 1 ? "n" : ""}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-6 w-6"
                          title="Vorlage anwenden"
                          onClick={() => setApplyTarget(t)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          title="Vorlage löschen"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Apply confirmation */}
      <AlertDialog
        open={!!applyTarget}
        onOpenChange={(o) => {
          if (!o) setApplyTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage anwenden?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Ebenenstruktur dieses Gebiets wird durch die Vorlage{" "}
              <strong>„{applyTarget?.name}"</strong> ersetzt. PLZ-Zuweisungen
              werden beibehalten, sofern ein Ebenenname übereinstimmt. Alle
              anderen PLZ werden nicht gelöscht, aber den Ebenen ggf. neu
              zugewiesen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplying}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleApply} disabled={isApplying}>
              {isApplying ? "Wird angewendet…" : "Anwenden"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Vorlage <strong>„{deleteTarget?.name}"</strong> wird dauerhaft
              gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Wird gelöscht…" : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
