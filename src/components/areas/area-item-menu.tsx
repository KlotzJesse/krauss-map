"use client";

import {
  IconCopy,
  IconDotsVertical,
  IconEdit,
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
  children: React.ReactNode;
}

/** Shared menu items rendered identically in both ContextMenu and DropdownMenu */
function MenuItems({
  area,
  onStartRename,
  onStartDelete,
  onDuplicate,
  variant,
}: Omit<AreaItemMenuProps, "children"> & {
  variant: "context" | "dropdown";
}) {
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const Sep =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;

  return (
    <>
      <Item onClick={(e) => onStartRename(area, e)}>
        <IconEdit className="h-4 w-4 mr-2" />
        Umbenennen
      </Item>
      <Item onClick={() => onDuplicate(area)}>
        <IconCopy className="h-4 w-4 mr-2" />
        Duplizieren
      </Item>
      <Sep />
      <Item onClick={(e) => onStartDelete(area, e)} variant="destructive">
        <IconTrash className="h-4 w-4 mr-2" />
        Löschen
      </Item>
    </>
  );
}

export const AreaItemMenu = memo(
  function AreaItemMenu({
    area,
    onStartRename,
    onStartDelete,
    onDuplicate,
    children,
  }: AreaItemMenuProps) {
    return (
      <ContextMenu>
        <ContextMenuTrigger className="w-full">{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <MenuItems
            area={area}
            onStartRename={onStartRename}
            onStartDelete={onStartDelete}
            onDuplicate={onDuplicate}
            variant="context"
          />
        </ContextMenuContent>
      </ContextMenu>
    );
  },
  (prev, next) =>
    prev.area.id === next.area.id &&
    prev.onStartRename === next.onStartRename &&
    prev.onStartDelete === next.onStartDelete &&
    prev.onDuplicate === next.onDuplicate
);

/** Standalone 3-dots dropdown button for area items */
export const AreaItemDropdown = memo(
  function AreaItemDropdown({
    area,
    onStartRename,
    onStartDelete,
    onDuplicate,
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
            variant="dropdown"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
  (prev, next) =>
    prev.area.id === next.area.id &&
    prev.onStartRename === next.onStartRename &&
    prev.onStartDelete === next.onStartDelete &&
    prev.onDuplicate === next.onDuplicate
);
