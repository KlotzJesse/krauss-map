"use client";

import {
  IconArchive,
  IconArchiveOff,
  IconCopy,
  IconDotsVertical,
  IconEdit,
  IconFileText,
  IconTrash,
} from "@tabler/icons-react";
import { memo } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AreaSummary } from "@/lib/types/area-types";

interface AreaItemMenuProps {
  area: AreaSummary;
  onStartRename: (area: AreaSummary, e: React.MouseEvent) => void;
  onStartDelete: (area: AreaSummary, e: React.MouseEvent) => void;
  onDuplicate: (area: AreaSummary) => void;
  onArchive: (area: AreaSummary, archive: boolean) => void;
  onEditNotes?: (area: AreaSummary) => void;
}

/** Menu items for the dropdown */
function MenuItems({
  area,
  onStartRename,
  onStartDelete,
  onDuplicate,
  onArchive,
  onEditNotes,
}: AreaItemMenuProps) {
  const isArchived = area.isArchived === "true";

  return (
    <>
      <DropdownMenuItem onClick={(e) => onStartRename(area, e)}>
        <IconEdit className="h-4 w-4 mr-2" />
        Umbenennen
      </DropdownMenuItem>
      {onEditNotes && (
        <DropdownMenuItem onClick={() => onEditNotes(area)}>
          <IconFileText className="h-4 w-4 mr-2" />
          Notizen bearbeiten
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => onDuplicate(area)}>
        <IconCopy className="h-4 w-4 mr-2" />
        Duplizieren
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onArchive(area, !isArchived)}>
        {isArchived ? (
          <IconArchiveOff className="h-4 w-4 mr-2" />
        ) : (
          <IconArchive className="h-4 w-4 mr-2" />
        )}
        {isArchived ? "Wiederherstellen" : "Archivieren"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={(e) => onStartDelete(area, e)}
        variant="destructive"
      >
        <IconTrash className="h-4 w-4 mr-2" />
        Löschen
      </DropdownMenuItem>
    </>
  );
}

/** Standalone 3-dots dropdown button for area items */
export const AreaItemDropdown = memo(
  function AreaItemDropdown({
    area,
    onStartRename,
    onStartDelete,
    onDuplicate,
    onArchive,
    onEditNotes,
  }: AreaItemMenuProps) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className="h-6 w-6 p-0 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none"
          onClick={(e) => e.stopPropagation()}
          title="Optionen"
        >
          <IconDotsVertical className="h-4 w-4" />
          <span className="sr-only">Menü</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <MenuItems
            area={area}
            onStartRename={onStartRename}
            onStartDelete={onStartDelete}
            onDuplicate={onDuplicate}
            onArchive={onArchive}
            onEditNotes={onEditNotes}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
  (prev, next) =>
    prev.area.id === next.area.id &&
    prev.area.isArchived === next.area.isArchived &&
    prev.onStartRename === next.onStartRename &&
    prev.onStartDelete === next.onStartDelete &&
    prev.onDuplicate === next.onDuplicate &&
    prev.onArchive === next.onArchive &&
    prev.onEditNotes === next.onEditNotes
);
