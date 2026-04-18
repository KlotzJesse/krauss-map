"use client";

import { Tag, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  getAllTagsAction,
  assignTagToAreaAction,
  removeTagFromAreaAction,
  createTagAction,
  deleteTagAction,
  updateTagAction,
  type AreaTagWithCount,
} from "@/app/actions/area-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { generatePalette } from "@/lib/utils/layer-colors";

import { TagBadge } from "./tag-badge";

interface AreaTagsManagerProps {
  areaId: number;
  initialTags: { id: number; name: string; color: string }[];
}

// 18 balanced jewel-tone swatches from generatePalette — generated once
const TAG_COLORS = generatePalette(18);

export function AreaTagsManager({ areaId, initialTags }: AreaTagsManagerProps) {
  const [tags, setTags] = useState(initialTags);
  const [allTags, setAllTags] = useState<AreaTagWithCount[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [editingTagColor, setEditingTagColor] = useState(TAG_COLORS[0]);
  const [isPending, startTransition] = useTransition();

  const loadAllTags = async () => {
    const res = await getAllTagsAction();
    if (res.success && res.data) {
      setAllTags(res.data);
    }
  };

  const handleOpen = (open: boolean) => {
    setPopoverOpen(open);
    if (open) {
      loadAllTags();
    } else {
      setEditingTagId(null);
    }
  };

  const handleAssign = (tag: { id: number; name: string; color: string }) => {
    if (tags.some((t) => t.id === tag.id)) return;
    startTransition(async () => {
      const res = await assignTagToAreaAction(areaId, tag.id);
      if (res.success) {
        setTags((prev) =>
          [...prev, tag].sort((a, b) => a.name.localeCompare(b.name))
        );
        toast.success(`Tag „${tag.name}" hinzugefügt`);
      } else {
        toast.error("Tag konnte nicht hinzugefügt werden");
      }
    });
  };

  const handleRemove = (tagId: number, tagName: string) => {
    startTransition(async () => {
      const res = await removeTagFromAreaAction(areaId, tagId);
      if (res.success) {
        setTags((prev) => prev.filter((t) => t.id !== tagId));
        toast.success(`Tag „${tagName}" entfernt`);
      } else {
        toast.error("Tag konnte nicht entfernt werden");
      }
    });
  };

  const handleCreate = () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await createTagAction(trimmed, newTagColor);
      if (res.success && res.data) {
        await loadAllTags();
        await handleAssign(res.data);
        setNewTagName("");
        toast.success(`Tag „${trimmed}" erstellt`);
      } else {
        toast.error(
          res.error?.includes("unique")
            ? "Tag-Name bereits vergeben"
            : "Tag konnte nicht erstellt werden"
        );
      }
    });
  };

  const handleDeleteTag = (tagId: number, tagName: string) => {
    startTransition(async () => {
      const res = await deleteTagAction(tagId);
      if (res.success) {
        setAllTags((prev) => prev.filter((t) => t.id !== tagId));
        setTags((prev) => prev.filter((t) => t.id !== tagId));
        toast.success(`Tag „${tagName}" gelöscht`);
      } else {
        toast.error("Tag konnte nicht gelöscht werden");
      }
    });
  };

  const startEditTag = (tag: AreaTagWithCount) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
    setEditingTagColor(tag.color);
  };

  const handleSaveTagEdit = () => {
    const trimmed = editingTagName.trim();
    if (!trimmed || editingTagId === null) return;
    startTransition(async () => {
      const res = await updateTagAction(editingTagId, trimmed, editingTagColor);
      if (res.success) {
        setAllTags((prev) =>
          prev.map((t) => t.id === editingTagId ? { ...t, name: trimmed, color: editingTagColor } : t)
        );
        setTags((prev) =>
          prev.map((t) => t.id === editingTagId ? { ...t, name: trimmed, color: editingTagColor } : t)
        );
        setEditingTagId(null);
        toast.success(`Tag umbenannt`);
      } else {
        toast.error("Umbenennen fehlgeschlagen");
      }
    });
  };

  const unassignedTags = allTags.filter(
    (t) => !tags.some((assigned) => assigned.id === t.id)
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <TagBadge
          key={tag.id}
          name={tag.name}
          color={tag.color}
          onRemove={() => handleRemove(tag.id, tag.name)}
        />
      ))}

      <Popover open={popoverOpen} onOpenChange={handleOpen}>
        <PopoverTrigger
          className={`h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center rounded-md border border-input bg-background hover:bg-accent transition-colors${isPending ? " opacity-50 pointer-events-none" : ""}`}
          disabled={isPending}
        >
          <Tag className="h-3 w-3" />
          <Plus className="h-3 w-3" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Tags verwalten
          </p>

          {/* Existing tags to assign or edit */}
          {allTags.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1.5">
                {unassignedTags.length > 0 ? "Vorhandene Tags" : "Alle Tags bereits zugewiesen"}
              </p>
              <div className="space-y-1">
                {allTags.map((tag) => {
                  const isAssigned = tags.some((t) => t.id === tag.id);
                  const isEditing = editingTagId === tag.id;
                  return (
                    <div key={tag.id} className="flex items-center gap-1 group min-h-[24px]">
                      {isEditing ? (
                        <>
                          <div
                            className="w-3 h-3 rounded-full shrink-0 border border-white/30"
                            style={{ backgroundColor: editingTagColor }}
                          />
                          <Input
                            value={editingTagName}
                            onChange={(e) => setEditingTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveTagEdit();
                              if (e.key === "Escape") setEditingTagId(null);
                            }}
                            className="h-5 text-xs flex-1 px-1.5 py-0"
                            autoFocus
                            maxLength={50}
                          />
                          <button
                            type="button"
                            onClick={handleSaveTagEdit}
                            className="text-green-600 hover:text-green-700 transition-colors"
                            title="Speichern"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTagId(null)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Abbrechen"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => !isAssigned && handleAssign(tag)}
                            className={isAssigned ? "cursor-default" : "cursor-pointer"}
                            title={isAssigned ? "Bereits zugewiesen" : `„${tag.name}" zuweisen`}
                          >
                            <TagBadge
                              name={tag.name}
                              color={tag.color}
                              small
                              className={isAssigned ? "opacity-40" : "hover:brightness-110"}
                            />
                          </button>
                          <span className="text-[9px] text-muted-foreground/60 ml-0.5 shrink-0">
                            {tag.areaCount}
                          </span>
                          <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => startEditTag(tag)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              title="Umbenennen"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTag(tag.id, tag.name)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Tag löschen"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Show editing color picker when renaming */}
          {editingTagId !== null && (
            <div className="mb-3">
              <p className="text-[10px] text-muted-foreground mb-1">Farbe wählen:</p>
              <div className="flex flex-wrap gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditingTagColor(c)}
                    className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${editingTagColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Farbe ${c}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Create new tag */}
          <div className={allTags.length > 0 ? "border-t pt-3" : ""}>
            <p className="text-xs text-muted-foreground mb-1.5">
              Neuen Tag erstellen
            </p>
            <div className="flex gap-2 items-center mb-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                placeholder="Tag-Name…"
                className="h-7 text-xs flex-1"
                maxLength={50}
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleCreate}
                disabled={!newTagName.trim() || isPending}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {/* Color swatches */}
            <div className="flex flex-wrap gap-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewTagColor(c)}
                  className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${newTagColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Farbe ${c}`}
                />
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
