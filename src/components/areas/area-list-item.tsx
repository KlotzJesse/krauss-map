"use client";

import {
  IconArchive,
  IconCheck,
  IconCheckbox,
  IconFolder,
  IconPin,
  IconPinFilled,
  IconSquare,
  IconX,
} from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import { memo, useEffect, useRef } from "react";
import type { RefObject } from "react";

import { LinkPendingIndicator } from "@/components/shared/link-pending-indicator";
import { Button } from "@/components/ui/button";
import { SidebarMenuItem } from "@/components/ui/sidebar";
import type { AreaSummary } from "@/lib/types/area-types";

import { AreaItemDropdown, AreaItemMenu } from "./area-item-menu";
import { TagBadge } from "./tag-badge";

function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 2) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wo.`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Mon.`;
  return `vor ${Math.floor(days / 365)} J.`;
}

interface AreaListItemProps {
  area: AreaSummary;
  isEditing: boolean;
  editingAreaName: string;
  editInputRef: RefObject<HTMLInputElement | null>;
  isCurrentRoute: boolean;
  isPinned?: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (areaId: number) => void;
  onTogglePin?: (areaId: number) => void;
  onStartRename: (area: AreaSummary, e: React.MouseEvent) => void;
  onConfirmRename: (areaId: number) => void;
  onCancelRename: () => void;
  onEditNameChange: (name: string) => void;
  onStartDelete: (area: AreaSummary, e: React.MouseEvent) => void;
  onDuplicate: (area: AreaSummary) => void;
  onArchive: (area: AreaSummary, archive: boolean) => void;
  onEditNotes?: (area: AreaSummary) => void;
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
    isSelectable = false,
    isSelected = false,
    onToggleSelect,
    onTogglePin,
    onStartRename,
    onConfirmRename,
    onCancelRename,
    onEditNameChange,
    onStartDelete,
    onDuplicate,
    onArchive,
    onEditNotes,
    onAreaClick,
  }: AreaListItemProps) {
    const isArchived = area.isArchived === "true";
    const itemRef = useRef<HTMLLIElement>(null);

    useEffect(() => {
      if (isCurrentRoute && itemRef.current) {
        itemRef.current.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }
    }, [isCurrentRoute]);

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
      <SidebarMenuItem ref={itemRef}>
        <AreaItemMenu
          area={area}
          onStartRename={onStartRename}
          onStartDelete={onStartDelete}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onEditNotes={onEditNotes}
          disabled={isSelectable}
        >
          <div className="group/item relative flex flex-col w-full">
            <div
              className={`relative flex items-center gap-2 w-full h-6 px-2 rounded-md transition-colors ${
                isSelectable && isSelected
                  ? "bg-primary/10 text-primary"
                  : isCurrentRoute && !isSelectable
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-[3px] border-primary !pl-[5px]"
                    : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              } ${isArchived ? "opacity-50" : ""} ${isSelectable ? "cursor-pointer select-none" : ""}`}
              onClick={
                isSelectable
                  ? (e) => {
                      e.preventDefault();
                      onToggleSelect?.(area.id);
                    }
                  : undefined
              }
              onDoubleClick={
                isSelectable
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onStartRename(area, e);
                    }
              }
            >
              {isSelectable ? (
                <span className="h-4 w-4 shrink-0 flex items-center justify-center text-primary">
                  {isSelected ? (
                    <IconCheckbox className="h-4 w-4" />
                  ) : (
                    <IconSquare className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
              ) : isArchived ? (
                <IconArchive
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  title="Archiviert"
                />
              ) : (
                <IconFolder
                  className={`h-4 w-4 shrink-0 ${isCurrentRoute ? "text-primary" : "text-muted-foreground"}`}
                  title={
                    area.updatedAt
                      ? `Geändert: ${relativeTime(area.updatedAt)}`
                      : undefined
                  }
                />
              )}
              {isSelectable ? (
                <span
                  title={area.name}
                  className={`flex-1 text-sm font-medium min-w-0 truncate ${isArchived ? "line-through text-muted-foreground" : ""}`}
                >
                  {area.name}
                </span>
              ) : (
                <Link
                  href={`/postal-codes/${area.id}` as Route}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAreaClick(area);
                  }}
                  className="flex flex-1 items-center gap-1 text-sm font-medium min-w-0"
                >
                  <span
                    title={area.name}
                    className={`truncate ${isArchived ? "line-through text-muted-foreground" : ""}`}
                  >
                    {area.name}
                  </span>
                  <LinkPendingIndicator />
                </Link>
              )}
              {!isSelectable && !!area.postalCodeCount && (
                <span
                  className="shrink-0 text-[9px] font-medium text-muted-foreground bg-muted rounded px-1 py-0.5 leading-none group-hover/item:opacity-0 transition-opacity"
                  title={`${area.postalCodeCount} PLZ`}
                >
                  {area.postalCodeCount}
                </span>
              )}

              {!isSelectable && isPinned && (
                <IconPinFilled className="shrink-0 h-2.5 w-2.5 text-amber-500 group-hover/item:opacity-0 transition-opacity" />
              )}
              {!isSelectable && (
                <div className="shrink-0 w-6 h-6 opacity-0 group-hover/item:opacity-100 transition-opacity absolute right-0 flex items-center">
                  {onTogglePin && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(area.id);
                      }}
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
                    onEditNotes={onEditNotes}
                  />
                </div>
              )}
            </div>
            {area.tags && area.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 px-2 pb-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity duration-150">
                {area.tags.map((tag) => (
                  <TagBadge
                    key={tag.id}
                    name={tag.name}
                    color={tag.color}
                    className="text-[9px] px-1 py-0 h-3.5"
                  />
                ))}
              </div>
            )}
            {!isSelectable &&
              !isArchived &&
              (area.totalPostalCodeCount ?? 0) > 0 && (
                <div className="absolute bottom-0 left-2 right-2 opacity-0 group-hover/item:opacity-100 transition-opacity duration-150">
                  {(() => {
                    const pct = Math.min(
                      100,
                      Math.round(
                        ((area.uniquePostalCodeCount ?? 0) /
                          (area.totalPostalCodeCount ?? 1)) *
                          100
                      )
                    );
                    return (
                      <div
                        className="h-0.5 bg-muted rounded-full overflow-hidden"
                        title={`Abdeckung: ${pct}%`}
                      >
                        <div
                          className={`h-full rounded-full transition-all ${
                            pct >= 80
                              ? "bg-green-500"
                              : pct >= 40
                                ? "bg-primary/70"
                                : "bg-amber-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
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
      prev.area.uniquePostalCodeCount !== next.area.uniquePostalCodeCount ||
      prev.area.totalPostalCodeCount !== next.area.totalPostalCodeCount ||
      prev.area.conflictCount !== next.area.conflictCount ||
      prev.area.isArchived !== next.area.isArchived ||
      prev.area.description !== next.area.description
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
    if (prev.isSelectable !== next.isSelectable) {
      return false;
    }
    if (prev.isSelected !== next.isSelected) {
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
