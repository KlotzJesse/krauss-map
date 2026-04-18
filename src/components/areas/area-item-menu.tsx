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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  children: React.ReactNode;
  disabled?: boolean;
}

/** Shared menu items rendered identically in both ContextMenu and DropdownMenu */
function MenuItems({
  area,
  onStartRename,
  onStartDelete,
  onDuplicate,
  onArchive,
  onEditNotes,
  variant,
}: Omit<AreaItemMenuProps, "children"> & {
  variant: "context" | "dropdown";
}) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Sep =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const isArchived = area.isArchived === "true";

  return (
    <>
      <Item onClick={(e) => onStartRename(area, e)}>
        <IconEdit className="h-4 w-4 mr-2" />
        Umbenennen
      </Item>
      {onEditNotes && (
        <Item onClick={() => onEditNotes(area)}>
          <IconFileText className="h-4 w-4 mr-2" />
          Notizen bearbeiten
        </Item>
      )}
      <Item onClick={() => onDuplicate(area)}>
        <IconCopy className="h-4 w-4 mr-2" />
        Duplizieren
      </Item>
      <Item onClick={() => onArchive(area, !isArchived)}>
        {isArchived ? (
          <IconArchiveOff className="h-4 w-4 mr-2" />
        ) : (
          <IconArchive className="h-4 w-4 mr-2" />
        )}
        {isArchived ? "Wiederherstellen" : "Archivieren"}
      </Item>
      <Sep />
      <Item onClick={(e) => onStartDelete(area, e)} variant="destructive">
        <IconTrash className="h-4 w-4 mr-2" />
        Löschen
      </Item>
    </>
  );
}

export const AreaItemMenu = memo(function AreaItemMenu({
  area,
  onStartRename,
  onStartDelete,
  onDuplicate,
  onArchive,
  onEditNotes,
  children,
  disabled = false,
}: AreaItemMenuProps) {
  if (disabled) {
    return <>{children}</>;
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <MenuItems
          area={area}
          onStartRename={onStartRename}
          onStartDelete={onStartDelete}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onEditNotes={onEditNotes}
          variant="context"
        />
      </ContextMenuContent>
    </ContextMenu>
  );
});

/** Standalone 3-dots dropdown button for area items */
export const AreaItemDropdown = memo(
  function AreaItemDropdown({
    area,
    onStartRename,
    onStartDelete,
    onDuplicate,
    onArchive,
    onEditNotes,
  }: Omit<AreaItemMenuProps, "children">) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className="h-6 w-6 p-0 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none"
          onClick={(e) => e.stopPropagation()}
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
            variant="dropdown"
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
