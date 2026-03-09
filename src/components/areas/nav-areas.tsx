"use client";

import {
  IconFolder,
  IconPlus,
  IconDots,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, Activity, useOptimistic, useTransition, use } from "react";
import { toast } from "sonner";

import { updateAreaAction, deleteAreaAction } from "@/app/actions/area-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Area } from "@/lib/types/area-types";

import { CreateAreaDialog } from "./create-area-dialog";

interface NavAreasProps {
  areasPromise: Promise<Area[]>;
  isLoading?: boolean;
  currentAreaId?: number | null;
  onAreaSelect?: (areaId: number) => void;
}

export function NavAreas({
  areasPromise,
  isLoading = false,
  currentAreaId: _currentAreaId,
  onAreaSelect,
}: NavAreasProps) {
  // Client Component: use() to consume promise where data is actually used
  const areas = use(areasPromise);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<number | null>(null);
  const [editingAreaName, setEditingAreaName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<Area | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const params = useParams();
  const currentAreaIdFromRoute = params?.areaId ? String(params.areaId) : null;

  // Optimistic state for areas
  const [optimisticAreas, updateOptimisticAreas] = useOptimistic(
    areas,
    (
      currentAreas: Area[],
      update: { type: "rename" | "delete"; id: number; name?: string }
    ) => {
      if (update.type === "rename" && update.name) {
        return currentAreas.map((area) =>
          area.id === update.id ? { ...area, name: update.name! } : area
        );
      }
      if (update.type === "delete") {
        return currentAreas.filter((area) => area.id !== update.id);
      }
      return currentAreas;
    }
  );

  const [_isPending, startTransition] = useTransition();

  const handleAreaClick = (area: Area) => {
    // This function is now mainly for the onAreaSelect callback
    // Navigation is handled by Link component
    if (onAreaSelect) {
      onAreaSelect(area.id);
    }
  };

  const getAreaUrl = (area: Area) => `/postal-codes/${area.id}`;

  const _handleAreaDoubleClick = (area: Area, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleStartRename(area, e);
  };

  const handleStartRename = (area: Area, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAreaId(area.id);
    setEditingAreaName(area.name);
  };

  const handleCancelRename = () => {
    setEditingAreaId(null);
    setEditingAreaName("");
  };

  const handleConfirmRename = async (areaId: number) => {
    if (!editingAreaName.trim()) {
      toast.error("Name darf nicht leer sein");
      return;
    }

    // Don't save if name hasn't changed
    const area = areas.find((a) => a.id === areaId);
    if (area && editingAreaName.trim() === area.name) {
      handleCancelRename();
      return;
    }

    // Optimistic update for instant feedback
    startTransition(async () => {
      updateOptimisticAreas({
        type: "rename",
        id: areaId,
        name: editingAreaName.trim(),
      });

      await toast.promise(
        updateAreaAction(areaId, {
          name: editingAreaName.trim(),
        }),
        {
          loading: "Benenne Gebiet um...",
          success: (data) => {
            if (data.success) {
              setEditingAreaId(null);
              setEditingAreaName("");
              return "Gebiet umbenannt";
            }
            throw new Error(data.error || "Umbenennen fehlgeschlagen");
          },
          error: "Umbenennen fehlgeschlagen",
        }
      );
    });
  };

  const handleStartDelete = (area: Area, e: React.MouseEvent) => {
    e.stopPropagation();
    setAreaToDelete(area);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!areaToDelete) {
      return;
    }

    setIsDeleting(true);

    // Optimistic update for instant feedback
    startTransition(async () => {
      updateOptimisticAreas({ type: "delete", id: areaToDelete.id });
      const areaName = areaToDelete.name;

      // Server action now handles redirect
      await toast.promise(deleteAreaAction(areaToDelete.id), {
        loading: `Lösche "${areaName}"...`,
        success: `"${areaName}" gelöscht`,
        error: "Löschen fehlgeschlagen",
      });
      // If successful, the server will redirect automatically
      setDeleteDialogOpen(false);
      setAreaToDelete(null);
      setIsDeleting(false);
    });
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>
          <div className="flex items-center justify-between w-full">
            <span>Gebiete</span>
            <button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="hover:bg-sidebar-accent rounded p-0.5"
              title="Neues Gebiet erstellen"
            >
              <IconPlus className="h-4 w-4" />
            </button>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <Activity mode={isLoading ? "visible" : "hidden"}>
              <SidebarMenuItem>
                <SidebarMenuButton disabled>Lade...</SidebarMenuButton>
              </SidebarMenuItem>
            </Activity>
            <Activity
              mode={
                !isLoading && optimisticAreas.length === 0
                  ? "visible"
                  : "hidden"
              }
            >
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setCreateDialogOpen(true)}
                  className="text-muted-foreground"
                >
                  <IconPlus className="h-4 w-4" />
                  <span>Erstes Gebiet erstellen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Activity>
            {!isLoading &&
              optimisticAreas.map((area) => (
                <SidebarMenuItem key={area.id}>
                  <div className="group/item relative flex items-center w-full">
                    {editingAreaId === area.id ? (
                      // Edit mode - Input field with icon inside (matches view mode styling)
                      <div className="flex items-center gap-2 w-full h-8 px-2 rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
                        <IconFolder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <input
                          type="text"
                          value={editingAreaName}
                          onChange={(e) => setEditingAreaName(e.target.value)}
                          className="flex-1 text-sm font-medium bg-transparent border-none outline-none focus:outline-none focus:ring-0 min-w-0"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleConfirmRename(area.id);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              handleCancelRename();
                            }
                          }}
                          onBlur={(e) => {
                            // Don't blur if clicking on check or X buttons
                            const relatedTarget =
                              e.relatedTarget as HTMLElement;
                            if (
                              relatedTarget &&
                              relatedTarget.closest("[data-edit-action]")
                            ) {
                              return;
                            }
                            // Only save if there's a valid name, otherwise cancel
                            if (
                              editingAreaName.trim() &&
                              editingAreaName.trim() !== area.name
                            ) {
                              handleConfirmRename(area.id);
                            } else {
                              handleCancelRename();
                            }
                          }}
                        />
                        {/* Action buttons for edit mode */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            onClick={() => handleConfirmRename(area.id)}
                            data-edit-action="confirm"
                          >
                            <IconCheck className="h-3.5 w-3.5" />
                            <span className="sr-only">Bestätigen</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            onClick={handleCancelRename}
                            data-edit-action="cancel"
                          >
                            <IconX className="h-3.5 w-3.5" />
                            <span className="sr-only">Abbrechen</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View mode - Clickable area with icon and dots inside
                      <div
                        className={`flex items-center gap-2 w-full h-8 px-2 rounded-md transition-colors ${
                          currentAreaIdFromRoute === String(area.id)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                        }`}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleStartRename(area, e);
                        }}
                      >
                        <IconFolder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <Link
                          href={getAreaUrl(area) as Route}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAreaClick(area);
                          }}
                          className="flex-1 text-sm font-medium truncate min-w-0"
                        >
                          {area.name}
                        </Link>

                        {/* Dropdown menu for actions - only visible on hover */}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              />
                            }
                          >
                            <IconDots className="h-3.5 w-3.5" />
                            <span className="sr-only">Aktionen</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={(e) => handleStartRename(area, e)}
                              className="cursor-pointer"
                            >
                              <IconEdit className="h-4 w-4 mr-2" />
                              Umbenennen
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => handleStartDelete(area, e)}
                              className="cursor-pointer text-destructive focus:text-destructive"
                            >
                              <IconTrash className="h-4 w-4 mr-2" />
                              Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <CreateAreaDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gebiet löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Gebiet &quot;{areaToDelete?.name}
              &quot; wirklich löschen?
              <br />
              <br />
              <strong>
                Alle Layer und Regionen werden unwiderruflich gelöscht.
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false);
                setAreaToDelete(null);
              }}
              disabled={isDeleting}
            >
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Lösche..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
