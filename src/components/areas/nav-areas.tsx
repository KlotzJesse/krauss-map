"use client";

import { IconPlus } from "@tabler/icons-react";
import { useParams } from "next/navigation";
import {
  Activity,
  useOptimistic,
  useReducer,
  useRef,
  useEffect,
  useTransition,
  use,
} from "react";
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
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { Area } from "@/lib/types/area-types";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";

import { AreaListItem } from "./area-list-item";
import { CreateAreaDialog } from "./create-area-dialog";

interface NavAreasState {
  createDialogOpen: boolean;
  editingAreaId: number | null;
  editingAreaName: string;
  deleteDialogOpen: boolean;
  areaToDelete: Area | null;
  isDeleting: boolean;
}

type NavAreasAction =
  | { type: "OPEN_CREATE" }
  | { type: "CLOSE_CREATE" }
  | { type: "START_EDIT"; areaId: number; name: string }
  | { type: "SET_EDIT_NAME"; name: string }
  | { type: "CANCEL_EDIT" }
  | { type: "FINISH_EDIT" }
  | { type: "OPEN_DELETE"; area: Area }
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
    dispatch({ type: "START_EDIT", areaId: area.id, name: area.name });
  };

  const handleCancelRename = () => {
    dispatch({ type: "CANCEL_EDIT" });
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
  };

  const handleStartDelete = (area: Area, e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "OPEN_DELETE", area });
  };

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
            <button
              type="button"
              onClick={() => dispatch({ type: "OPEN_CREATE" })}
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
                  onClick={() => dispatch({ type: "OPEN_CREATE" })}
                  className="text-muted-foreground"
                >
                  <IconPlus className="h-4 w-4" />
                  <span>Erstes Gebiet erstellen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </Activity>
            {!isLoading &&
              optimisticAreas.map((area) => (
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
                  onEditNameChange={(name) =>
                    dispatch({ type: "SET_EDIT_NAME", name })
                  }
                  onStartDelete={handleStartDelete}
                  onAreaClick={handleAreaClick}
                  getAreaUrl={getAreaUrl}
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
