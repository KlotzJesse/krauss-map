"use client";

import { useState, useTransition } from "react";
import { Tag, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TagBadge } from "./tag-badge";
import {
  getAllTagsAction,
  assignTagToAreaAction,
  removeTagFromAreaAction,
  createTagAction,
  deleteTagAction,
  type AreaTagWithCount,
} from "@/app/actions/area-actions";

interface AreaTagsManagerProps {
  areaId: number;
  initialTags: { id: number; name: string; color: string }[];
}

const TAG_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#84cc16", "#6366f1",
];

export function AreaTagsManager({ areaId, initialTags }: AreaTagsManagerProps) {
  const [tags, setTags] = useState(initialTags);
  const [allTags, setAllTags] = useState<AreaTagWithCount[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
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
    }
  };

  const handleAssign = (tag: { id: number; name: string; color: string }) => {
    if (tags.some((t) => t.id === tag.id)) return;
    startTransition(async () => {
      const res = await assignTagToAreaAction(areaId, tag.id);
      if (res.success) {
        setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
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
        toast.error(res.error?.includes("unique") ? "Tag-Name bereits vergeben" : "Tag konnte nicht erstellt werden");
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

  const unassignedTags = allTags.filter((t) => !tags.some((assigned) => assigned.id === t.id));

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
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Tags verwalten</p>

          {/* Existing tags to assign */}
          {unassignedTags.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1.5">Vorhandene Tags</p>
              <div className="flex flex-wrap gap-1">
                {unassignedTags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-0.5 group">
                    <button
                      type="button"
                      onClick={() => handleAssign(tag)}
                      className="cursor-pointer"
                    >
                      <TagBadge name={tag.name} color={tag.color} small />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTag(tag.id, tag.name)}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-destructive"
                      title="Tag löschen"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create new tag */}
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-1.5">Neuen Tag erstellen</p>
            <div className="flex gap-2 items-center mb-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
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
                  className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${newTagColor === c ? "border-foreground scale-110" : "border-transparent"}`}
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
