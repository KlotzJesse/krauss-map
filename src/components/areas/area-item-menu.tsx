"use client";

import { IconDots, IconEdit, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Area } from "@/lib/types/area-types";

interface AreaItemMenuProps {
  area: Area;
  onStartRename: (area: Area, e: React.MouseEvent) => void;
  onStartDelete: (area: Area, e: React.MouseEvent) => void;
}

export function AreaItemMenu({
  area,
  onStartRename,
  onStartDelete,
}: AreaItemMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <IconDots className="h-3.5 w-3.5" />
        <span className="sr-only">Aktionen</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          onClick={(e) => onStartRename(area, e)}
          className="cursor-pointer"
        >
          <IconEdit className="h-4 w-4 mr-2" />
          Umbenennen
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => onStartDelete(area, e)}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <IconTrash className="h-4 w-4 mr-2" />
          Löschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
