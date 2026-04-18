"use client";

import { IconArchive, IconCheck, IconFolder, IconPin, IconPinFilled, IconX } from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import { memo } from "react";
import type { RefObject } from "react";

import { LinkPendingIndicator } from "@/components/shared/link-pending-indicator";
import { Button } from "@/components/ui/button";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import type { AreaSummary } from "@/lib/types/area-types";

import { AreaItemDropdown, AreaItemMenu } from "./area-item-menu";

interface AreaListItemProps {
  area: AreaSummary;
  isEditing: boolean;
  editingAreaName: string;
  editInputRef: RefObject<HTMLInputElement | null>;
  isCurrentRoute: boolean;
  isPinned?: boolean;
  onTogglePin?: (areaId: number) => void;
  onStartRename: (area: AreaSummary, e: React.MouseEvent) => void;
  onConfirmRename: (areaId: number) => void;
  onCancelRename: () => void;
  onEditNameChange: (name: string) => void;
  onStartDelete: (area: AreaSummary, e: React.MouseEvent) => void;
  onDuplicate: (area: AreaSummary) => void;
  onArchive: (area: AreaSummary, archive: boolean) => void;
  onAreaClick: (area: AreaSummary) => void;
}

export const AreaListItem = memo(
  function AreaListItem({
    area,
    isEditing,
    editingAreaName,
    editInputRef,
    isCurrentRoute,
    isPinned = false,
    onTogglePin,
    onStartRename,
    onConfirmRename,
    onCancelRename,
    onEditNameChange,
    onStartDelete,
    onDuplicate,
    onArchive,
    onAreaClick,
  }: AreaListItemProps) {
    const isArchived = area.isArchived === "true";
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
        <AreaItemMenu
          area={area}
          onStartRename={onStartRename}
          onStartDelete={onStartDelete}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
        >
          <div className="group/item relative flex items-center w-full">
            <div
              className={`flex items-center gap-2 w-full h-8 px-2 rounded-md transition-colors ${
                isCurrentRoute
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              } ${isArchived ? "opacity-50" : ""}`}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStartRename(area, e);
              }}
            >
              {isArchived ? (
                <IconArchive className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <IconFolder className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <Link
                href={`/postal-codes/${area.id}` as Route}
                onClick={(e) => {
                  e.stopPropagation();
                  onAreaClick(area);
                }}
                className="flex flex-1 items-center gap-1 text-sm font-medium min-w-0"
              >
                <span className={`truncate ${isArchived ? "line-through text-muted-foreground" : ""}`}>{area.name}</span>
                <LinkPendingIndicator />
              </Link>
              {!!area.postalCodeCount && (
                <span className="shrink-0 text-[9px] font-medium text-muted-foreground bg-muted rounded px-1 py-0.5 leading-none group-hover/item:opacity-0 transition-opacity" title={`${area.postalCodeCount} PLZ`}>
                  {area.postalCodeCount}
                </span>
              )}
              {!!area.layerCount && (
                <span className="shrink-0 text-[9px] font-medium text-muted-foreground/60 bg-muted rounded px-1 py-0.5 leading-none group-hover/item:opacity-0 transition-opacity" title={`${area.layerCount} Gebiete`}>
                  {area.layerCount}L
                </span>
              )}
              {isPinned && (
                <IconPinFilled className="shrink-0 h-2.5 w-2.5 text-amber-500 group-hover/item:opacity-0 transition-opacity" />
              )}
              <div className="shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity absolute right-0 flex items-center">
                {onTogglePin && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTogglePin(area.id); }}
                    className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-amber-500 transition-colors"
                    title={isPinned ? "Anheften aufheben" : "Anheften"}
                  >
                    {isPinned ? (
                      <IconPinFilled className="h-3 w-3 text-amber-500" />
                    ) : (
                      <IconPin className="h-3 w-3" />
                    )}
                  </button>
                )}
                <AreaItemDropdown
                  area={area}
                  onStartRename={onStartRename}
                  onStartDelete={onStartDelete}
                  onDuplicate={onDuplicate}
                  onArchive={onArchive}
                />
              </div>
            </div>
          </div>
        </AreaItemMenu>
      </SidebarMenuItem>
    );
  },
  (prev, next) => {
    // Compare by area identity (id + name), not reference — server data creates new objects
    if (
      prev.area.id !== next.area.id ||
      prev.area.name !== next.area.name ||
      prev.area.country !== next.area.country ||
      prev.area.postalCodeCount !== next.area.postalCodeCount ||
      prev.area.isArchived !== next.area.isArchived
    ) {
      return false;
    }
    if (prev.isCurrentRoute !== next.isCurrentRoute) {
      return false;
    }
    if (prev.isPinned !== next.isPinned) {
      return false;
    }
    if (prev.isEditing !== next.isEditing) {
      return false;
    }
    // Only compare edit props when actually editing
    if (next.isEditing) {
      if (prev.editingAreaName !== next.editingAreaName) {
        return false;
      }
    }
    // Callbacks use useCallback in parent — skip identity checks since
    // handleConfirmRename depends on editingAreaName/areas which change frequently.
    // The latest closure is always captured via the area.id passed as argument.
    return true;
  }
);
