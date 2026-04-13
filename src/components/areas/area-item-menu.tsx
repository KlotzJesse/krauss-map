"use client";

import { IconCopy, IconEdit, IconTrash } from "@tabler/icons-react";
import { memo } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { AreaSummary } from "@/lib/types/area-types";

interface AreaItemMenuProps {
  area: AreaSummary;
  onStartRename: (area: AreaSummary, e: React.MouseEvent) => void;
  onStartDelete: (area: AreaSummary, e: React.MouseEvent) => void;
  onDuplicate: (area: AreaSummary) => void;
  children: React.ReactNode;
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
          <ContextMenuItem onClick={(e) => onStartRename(area, e)}>
            <IconEdit className="h-4 w-4 mr-2" />
            Umbenennen
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onDuplicate(area)}>
            <IconCopy className="h-4 w-4 mr-2" />
            Duplizieren
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={(e) => onStartDelete(area, e)}
            variant="destructive"
          >
            <IconTrash className="h-4 w-4 mr-2" />
            Löschen
          </ContextMenuItem>
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
