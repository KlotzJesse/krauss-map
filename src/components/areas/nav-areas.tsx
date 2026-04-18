"use client";

import { IconArchive, IconPlus } from "@tabler/icons-react";
import { usePathname } from "next/navigation";
import {
  useOptimistic,
  useReducer,
  useRef,
  useEffect,
  useTransition,
  useCallback,
} from "react";
import { toast } from "sonner";

import {
  updateAreaAction,
  deleteAreaAction,
  duplicateAreaAction,
  archiveAreaAction,
} from "@/app/actions/area-actions";
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
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { AreaSummary } from "@/lib/types/area-types";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

import { AreaListItem } from "./area-list-item";
import { CreateAreaDialog } from "./create-area-dialog";

interface NavAreasState {
  createDialogOpen: boolean;
  editingAreaId: number | null;
  editingAreaName: string;
  deleteDialogOpen: boolean;
  areaToDelete: AreaSummary | null;
  isDeleting: boolean;
}

type NavAreasAction =
  | { type: "OPEN_CREATE" }
  | { type: "CLOSE_CREATE" }
  | { type: "START_EDIT"; areaId: number; name: string }
  | { type: "SET_EDIT_NAME"; name: string }
  | { type: "CANCEL_EDIT" }
  | { type: "FINISH_EDIT" }
  | { type: "OPEN_DELETE"; area: AreaSummary }
  | { type: "CLOSE_DELETE" }
  | { type: "START_DELETING" }
  | { type: "FINISH_DELETING" };

const initialState: NavAreasState = {
  createDialogOpen: false,
  editingAreaId: null,
  editingAreaName: "",
  deleteDialogOpen: false,
  areaToDelete: null,
  isDeleting: false,
};

function navAreasReducer(
  state: NavAreasState,
  action: NavAreasAction
): NavAreasState {
  switch (action.type) {
    case "OPEN_CREATE": {
      return { ...state, createDialogOpen: true };
    }
    case "CLOSE_CREATE": {
      return { ...state, createDialogOpen: false };
    }
    case "START_EDIT": {
      return {
        ...state,
        editingAreaId: action.areaId,
        editingAreaName: action.name,
      };
    }
    case "SET_EDIT_NAME": {
      return { ...state, editingAreaName: action.name };
    }
    case "CANCEL_EDIT": {
      return { ...state, editingAreaId: null, editingAreaName: "" };
    }
    case "FINISH_EDIT": {
      return { ...state, editingAreaId: null, editingAreaName: "" };
    }
    case "OPEN_DELETE": {
      return { ...state, areaToDelete: action.area, deleteDialogOpen: true };
    }
    case "CLOSE_DELETE": {
      return { ...state, deleteDialogOpen: false, areaToDelete: null };
    }
    case "START_DELETING": {
      return { ...state, isDeleting: true };
    }
    case "FINISH_DELETING": {
      return {
        ...state,
        isDeleting: false,
        deleteDialogOpen: false,
        areaToDelete: null,
      };
    }
    default: {
      return state;
    }
  }
}

interface NavAreasProps {
  areas: AreaSummary[];
  isLoading?: boolean;
  currentAreaId?: number | null;
  onAreaSelect?: (areaId: number) => void;
}

export function NavAreas({
  areas,
  isLoading = false,
  currentAreaId: _currentAreaId,
  onAreaSelect,
}: NavAreasProps) {
  const [state, dispatch] = useReducer(navAreasReducer, initialState);
  const {
    createDialogOpen,
    editingAreaId,
    editingAreaName,
    deleteDialogOpen,
    areaToDelete,
    isDeleting,
  } = state;
  const editInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editingAreaId !== null) {
      editInputRef.current?.focus();
    }
  }, [editingAreaId]);
  const pathname = usePathname();
  const currentAreaIdFromRoute =
    pathname?.match(/\/postal-codes\/(\d+)/)?.[1] ?? null;

  // Optimistic state for areas
  const [optimisticAreas, updateOptimisticAreas] = useOptimistic(
    areas,
    (
      currentAreas: AreaSummary[],
      update: { type: "rename" | "delete" | "archive"; id: number; name?: string; isArchived?: string }
    ) => {
      if (update.type === "rename" && update.name) {
        return currentAreas.map((area) =>
          area.id === update.id ? { ...area, name: update.name! } : area
        );
      }
      if (update.type === "delete") {
        return currentAreas.filter((area) => area.id !== update.id);
      }
      if (update.type === "archive") {
        return currentAreas.map((area) =>
          area.id === update.id ? { ...area, isArchived: update.isArchived ?? "false" } : area
        );
      }
      return currentAreas;
    }
  );

  const [showArchived, setShowArchived] = useReducer((v: boolean) => !v, false);

  const visibleAreas = showArchived
    ? optimisticAreas
    : optimisticAreas.filter((a) => a.isArchived !== "true");
  const archivedCount = optimisticAreas.filter((a) => a.isArchived === "true").length;

  const [_isPending, startTransition] = useTransition();

  const handleAreaClick = useCallback(
    (area: AreaSummary) => {
      if (onAreaSelect) {
        onAreaSelect(area.id);
      }
    },
    [onAreaSelect]
  );

  const handleStartRename = useCallback(
    (area: AreaSummary, e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch({ type: "START_EDIT", areaId: area.id, name: area.name });
    },
    []
  );

  const handleCancelRename = useCallback(() => {
    dispatch({ type: "CANCEL_EDIT" });
  }, []);

  const handleConfirmRename = useStableCallback(async (areaId: number) => {
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

      const result = await executeAction(
        updateAreaAction(areaId, {
          name: editingAreaName.trim(),
        }),
        {
          loading: "Benenne Gebiet um...",
          success: "Gebiet umbenannt",
          error: "Umbenennen fehlgeschlagen",
        }
      );

      if (result && "success" in result && result.success) {
        dispatch({ type: "FINISH_EDIT" });
      }
    });
  });

  const handleEditNameChange = useCallback((name: string) => {
    dispatch({ type: "SET_EDIT_NAME", name });
  }, []);

  const handleStartDelete = useCallback(
    (area: AreaSummary, e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch({ type: "OPEN_DELETE", area });
    },
    []
  );

  const handleDuplicate = useCallback(
    (area: AreaSummary) => {
      startTransition(async () => {
        await executeAction(duplicateAreaAction(area.id), {
          loading: `Dupliziere "${area.name}"...`,
          success: `"${area.name}" dupliziert`,
          error: "Duplizieren fehlgeschlagen",
        });
      });
    },
    [startTransition]
  );

  const handleArchive = useCallback(
    (area: AreaSummary, archive: boolean) => {
      startTransition(async () => {
        updateOptimisticAreas({ type: "archive", id: area.id, isArchived: archive ? "true" : "false" });
        await executeAction(archiveAreaAction(area.id, archive), {
          loading: archive ? `Archiviere "${area.name}"...` : `Stelle "${area.name}" wieder her...`,
          success: archive ? `"${area.name}" archiviert` : `"${area.name}" wiederhergestellt`,
          error: "Fehler beim Archivieren",
        });
      });
    },
    [startTransition]
  );

  const handleConfirmDelete = async () => {
    if (!areaToDelete) {
      return;
    }

    dispatch({ type: "START_DELETING" });

    // Optimistic update for instant feedback
    startTransition(async () => {
      updateOptimisticAreas({ type: "delete", id: areaToDelete.id });
      const areaName = areaToDelete.name;

      // Server action now handles redirect
      await executeAction(deleteAreaAction(areaToDelete.id), {
        loading: `Lösche "${areaName}"...`,
        success: `"${areaName}" gelöscht`,
        error: "Löschen fehlgeschlagen",
      });
      dispatch({ type: "FINISH_DELETING" });
    });
  };

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>
          <div className="flex items-center justify-between w-full">
            <span>Gebiete</span>
            <div className="flex items-center gap-0.5">
              {archivedCount > 0 && (
                <button
                  type="button"
                  onClick={setShowArchived}
                  className={`hover:bg-sidebar-accent rounded p-0.5 relative ${showArchived ? "text-amber-500" : "text-muted-foreground"}`}
                  title={showArchived ? "Archivierte ausblenden" : `${archivedCount} archivierte anzeigen`}
                >
                  <IconArchive className="h-3.5 w-3.5" />
                  {!showArchived && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 text-[8px] leading-none flex items-center justify-center rounded-full bg-amber-500 text-white font-bold">
                      {archivedCount}
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => dispatch({ type: "OPEN_CREATE" })}
                className="hover:bg-sidebar-accent rounded p-0.5"
                title="Neues Gebiet erstellen"
              >
                <IconPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {isLoading && (
              <SidebarMenuItem>
                <SidebarMenuButton disabled>Lade...</SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {!isLoading && visibleAreas.length === 0 && optimisticAreas.length === 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => dispatch({ type: "OPEN_CREATE" })}
                  className="text-muted-foreground"
                >
                  <IconPlus className="h-4 w-4" />
                  <span>Erstes Gebiet erstellen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {!isLoading &&
              visibleAreas.map((area) => (
                <AreaListItem
                  key={area.id}
                  area={area}
                  isEditing={editingAreaId === area.id}
                  editingAreaName={editingAreaName}
                  editInputRef={editInputRef}
                  isCurrentRoute={currentAreaIdFromRoute === String(area.id)}
                  onStartRename={handleStartRename}
                  onConfirmRename={handleConfirmRename}
                  onCancelRename={handleCancelRename}
                  onEditNameChange={handleEditNameChange}
                  onStartDelete={handleStartDelete}
                  onDuplicate={handleDuplicate}
                  onArchive={handleArchive}
                  onAreaClick={handleAreaClick}
                />
              ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <CreateAreaDialog
        open={createDialogOpen}
        onOpenChange={(open) =>
          dispatch(open ? { type: "OPEN_CREATE" } : { type: "CLOSE_CREATE" })
        }
      />

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            dispatch({ type: "CLOSE_DELETE" });
          }
        }}
      >
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
              onClick={() => dispatch({ type: "CLOSE_DELETE" })}
              disabled={isDeleting}
            >
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              variant="destructive"
            >
              {isDeleting ? "Lösche..." : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
