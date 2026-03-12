"use client";

import {
  IconCheck,
  IconDots,
  IconEdit,
  IconFolder,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import type { RefObject } from "react";

import { LinkPendingIndicator } from "@/components/shared/link-pending-indicator";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import type { Area } from "@/lib/types/area-types";

interface AreaListItemProps {
  area: Area;
  isEditing: boolean;
  editingAreaName: string;
  editInputRef: RefObject<HTMLInputElement | null>;
  isCurrentRoute: boolean;
  onStartRename: (area: Area, e: React.MouseEvent) => void;
  onConfirmRename: (areaId: number) => void;
  onCancelRename: () => void;
  onEditNameChange: (name: string) => void;
  onStartDelete: (area: Area, e: React.MouseEvent) => void;
  onAreaClick: (area: Area) => void;
  getAreaUrl: (area: Area) => string;
}

export function AreaListItem({
  area,
  isEditing,
  editingAreaName,
  editInputRef,
  isCurrentRoute,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  onEditNameChange,
  onStartDelete,
  onAreaClick,
  getAreaUrl,
}: AreaListItemProps) {
  if (isEditing) {
    return (
      <SidebarMenuItem>
        <div className="flex items-center gap-2 w-full h-8 px-2 rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
          <IconFolder className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={editInputRef}
            type="text"
            value={editingAreaName}
            onChange={(e) => onEditNameChange(e.target.value)}
            className="flex-1 text-sm font-medium bg-transparent border-none outline-none focus:outline-none focus:ring-0 min-w-0"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirmRename(area.id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelRename();
              }
            }}
            onBlur={(e) => {
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (relatedTarget?.closest("[data-edit-action]")) {
                return;
              }
              if (
                editingAreaName.trim() &&
                editingAreaName.trim() !== area.name
              ) {
                onConfirmRename(area.id);
              } else {
                onCancelRename();
              }
            }}
          />
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              onClick={() => onConfirmRename(area.id)}
              data-edit-action="confirm"
            >
              <IconCheck className="h-3.5 w-3.5" />
              <span className="sr-only">Bestätigen</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              onClick={onCancelRename}
              data-edit-action="cancel"
            >
              <IconX className="h-3.5 w-3.5" />
              <span className="sr-only">Abbrechen</span>
            </Button>
          </div>
        </div>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <div className="group/item relative flex items-center w-full">
        <div
          className={`flex items-center gap-2 w-full h-8 px-2 rounded-md transition-colors ${
            isCurrentRoute
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
          }`}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStartRename(area, e);
          }}
        >
          <IconFolder className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Link
            href={getAreaUrl(area) as Route}
            onClick={(e) => {
              e.stopPropagation();
              onAreaClick(area);
            }}
            className="flex flex-1 items-center gap-1 text-sm font-medium min-w-0"
          >
            <span className="truncate">{area.name}</span>
            <LinkPendingIndicator />
          </Link>
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
        </div>
      </div>
    </SidebarMenuItem>
  );
}
