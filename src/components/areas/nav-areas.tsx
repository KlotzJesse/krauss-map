"use client";

import {
  IconArchive,
  IconCheckbox,
  IconDownload,
  IconLayoutList,
  IconPlus,
  IconSearch,
  IconSquare,
  IconTags,
  IconX,
} from "@tabler/icons-react";
import { usePathname } from "next/navigation";
import {
  useOptimistic,
  useReducer,
  useRef,
  useEffect,
  useTransition,
  useCallback,
  useState,
  useMemo,
} from "react";
import { toast } from "sonner";

import {
  updateAreaAction,
  deleteAreaAction,
  duplicateAreaAction,
  archiveAreaAction,
  bulkAssignTagToAreasAction,
  bulkRemoveTagFromAreasAction,
  getAllAreasWithLayersForExportAction,
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { useAreaPins } from "@/lib/hooks/use-area-pins";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import type { AreaSummary } from "@/lib/types/area-types";
import { executeAction } from "@/lib/utils/action-state-callbacks/execute-action";
import { exportAllAreasXLSX } from "@/lib/utils/export-utils";

import { AreaListItem } from "./area-list-item";
import { CreateAreaDialog } from "./create-area-dialog";
import { PlzSearch } from "./plz-search";
import { TagBadge } from "./tag-badge";

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
  const { isPinned, togglePin } = useAreaPins();
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
      update: {
        type: "rename" | "delete" | "archive";
        id: number;
        name?: string;
        isArchived?: string;
      }
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
          area.id === update.id
            ? { ...area, isArchived: update.isArchived ?? "false" }
            : area
        );
      }
      return currentAreas;
    }
  );

  const [showArchived, setShowArchived] = useReducer((v: boolean) => !v, false);
  const [areaSearch, setAreaSearch] = useState("");
  const [activeTagId, setActiveTagId] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [groupByTag, setGroupByTag] = useReducer((v: boolean) => !v, false);
  const [selectedAreaIds, setSelectedAreaIds] = useState<Set<number>>(
    new Set()
  );
  const [notesArea, setNotesArea] = useState<AreaSummary | null>(null);
  const [notesText, setNotesText] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Collect all unique tags across all areas
  const allTags = useMemo(() => {
    const tagMap = new Map<
      number,
      { id: number; name: string; color: string }
    >();
    for (const area of optimisticAreas) {
      for (const tag of area.tags ?? []) {
        if (!tagMap.has(tag.id)) tagMap.set(tag.id, tag);
      }
    }
    return [...tagMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [optimisticAreas]);

  const baseVisibleAreas = showArchived
    ? optimisticAreas
    : optimisticAreas.filter((a) => a.isArchived !== "true");

  const visibleAreas = useMemo(() => {
    const q = areaSearch.trim().toLowerCase();
    let filtered = q
      ? baseVisibleAreas.filter((a) => a.name.toLowerCase().includes(q))
      : baseVisibleAreas;
    if (activeTagId !== null) {
      filtered = filtered.filter((a) =>
        a.tags?.some((t) => t.id === activeTagId)
      );
    }
    // Sort pinned areas to top, preserve original order within groups
    return [...filtered].sort((a, b) => {
      const pa = isPinned(a.id) ? 0 : 1;
      const pb = isPinned(b.id) ? 0 : 1;
      return pa - pb;
    });
  }, [baseVisibleAreas, areaSearch, activeTagId, isPinned]);

  const archivedCount = optimisticAreas.filter(
    (a) => a.isArchived === "true"
  ).length;

  // Group visibleAreas by tag (when groupByTag is on)
  const groupedByTag = useMemo(() => {
    if (!groupByTag) return null;
    const groups = new Map<
      number | null,
      {
        tag: { id: number; name: string; color: string } | null;
        areas: AreaSummary[];
      }
    >();
    groups.set(null, { tag: null, areas: [] });
    for (const tag of allTags) {
      groups.set(tag.id, { tag, areas: [] });
    }
    for (const area of visibleAreas) {
      if (!area.tags || area.tags.length === 0) {
        groups.get(null)!.areas.push(area);
      } else {
        for (const tag of area.tags) {
          groups.get(tag.id)?.areas.push(area);
        }
      }
    }
    // Remove empty groups (except "no tag" which we'll show if non-empty)
    return [...groups.values()].filter((g) => g.areas.length > 0);
  }, [groupByTag, visibleAreas, allTags]);

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
        updateOptimisticAreas({
          type: "archive",
          id: area.id,
          isArchived: archive ? "true" : "false",
        });
        await executeAction(archiveAreaAction(area.id, archive), {
          loading: archive
            ? `Archiviere "${area.name}"...`
            : `Stelle "${area.name}" wieder her...`,
          success: archive
            ? `"${area.name}" archiviert`
            : `"${area.name}" wiederhergestellt`,
          error: "Fehler beim Archivieren",
        });
      });
    },
    [startTransition]
  );

  const handleToggleSelectMode = useCallback(() => {
    setSelectMode((v) => !v);
    setSelectedAreaIds(new Set());
  }, []);

  const handleToggleSelectArea = useCallback((areaId: number) => {
    setSelectedAreaIds((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedAreaIds(new Set(visibleAreas.map((a) => a.id)));
  }, [visibleAreas]);

  const handleBulkAssignTag = useCallback(
    (tagId: number) => {
      const ids = [...selectedAreaIds];
      if (!ids.length) return;
      startTransition(async () => {
        await executeAction(bulkAssignTagToAreasAction(ids, tagId), {
          loading: `Weise Tag zu...`,
          success: `Tag ${ids.length} Gebiet(en) zugewiesen`,
          error: "Zuweisung fehlgeschlagen",
        });
      });
    },
    [selectedAreaIds, startTransition]
  );

  const handleBulkRemoveTag = useCallback(
    (tagId: number) => {
      const ids = [...selectedAreaIds];
      if (!ids.length) return;
      startTransition(async () => {
        await executeAction(bulkRemoveTagFromAreasAction(ids, tagId), {
          loading: `Entferne Tag...`,
          success: `Tag von ${ids.length} Gebiet(en) entfernt`,
          error: "Entfernen fehlgeschlagen",
        });
      });
    },
    [selectedAreaIds, startTransition]
  );

  const handleEditNotes = useCallback((area: AreaSummary) => {
    setNotesArea(area);
    setNotesText(area.description ?? "");
  }, []);

  const handleSaveNotes = async () => {
    if (!notesArea) return;
    setIsSavingNotes(true);
    await executeAction(
      updateAreaAction(notesArea.id, { description: notesText }),
      {
        loading: "Speichere Notizen...",
        success: "Notizen gespeichert",
        error: "Speichern fehlgeschlagen",
      }
    );
    setIsSavingNotes(false);
    setNotesArea(null);
  };

  const handleBulkExport = useCallback(async () => {
    const res = await getAllAreasWithLayersForExportAction();
    if (!res.success || !res.data?.length) {
      toast.warning("Keine Gebiete zum Exportieren");
      return;
    }
    await exportAllAreasXLSX(res.data);
  }, []);

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
      <div className="group-data-[collapsible=icon]:hidden">
        <PlzSearch />
      </div>
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
                  title={
                    showArchived
                      ? "Archivierte ausblenden"
                      : `${archivedCount} archivierte anzeigen`
                  }
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
                onClick={handleBulkExport}
                className="hover:bg-sidebar-accent rounded p-0.5 text-muted-foreground"
                title="Alle Gebiete als Excel exportieren"
              >
                <IconDownload className="h-3.5 w-3.5" />
              </button>
              {allTags.length > 0 && (
                <button
                  type="button"
                  onClick={setGroupByTag}
                  className={`hover:bg-sidebar-accent rounded p-0.5 ${groupByTag ? "text-primary" : "text-muted-foreground"}`}
                  title={
                    groupByTag
                      ? "Gruppenansicht beenden"
                      : "Nach Tags gruppieren"
                  }
                >
                  <IconLayoutList className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleToggleSelectMode}
                className={`hover:bg-sidebar-accent rounded p-0.5 ${selectMode ? "text-primary" : "text-muted-foreground"}`}
                title={
                  selectMode
                    ? "Auswahlmodus beenden"
                    : "Mehrere Gebiete auswählen"
                }
              >
                <IconTags className="h-3.5 w-3.5" />
              </button>
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
        {optimisticAreas.length >= 5 && (
          <div className="px-2 pb-1">
            <div className="relative flex items-center">
              <IconSearch className="absolute left-2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={areaSearch}
                onChange={(e) => setAreaSearch(e.target.value)}
                placeholder="Gebiete filtern…"
                className="w-full h-6 pl-6 pr-5 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background transition-colors"
              />
              {areaSearch && (
                <button
                  type="button"
                  onClick={() => setAreaSearch("")}
                  className="absolute right-1.5 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  <IconX className="h-3 w-3" />
                </button>
              )}
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setActiveTagId(activeTagId === tag.id ? null : tag.id)
                    }
                    className={`transition-opacity ${activeTagId !== null && activeTagId !== tag.id ? "opacity-40" : ""}`}
                    title={
                      activeTagId === tag.id
                        ? "Filter entfernen"
                        : `Nur „${tag.name}" anzeigen`
                    }
                  >
                    <TagBadge
                      name={tag.name}
                      color={tag.color}
                      small
                      className="cursor-pointer hover:brightness-110"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <SidebarGroupContent>
          {selectMode && (
            <div className="px-2 pb-2 pt-1 border-b border-border/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-foreground">
                  {selectedAreaIds.size > 0
                    ? `${selectedAreaIds.size} ausgewählt`
                    : "Gebiete auswählen"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted transition-colors"
                  >
                    Alle
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAreaIds(new Set())}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded hover:bg-muted transition-colors"
                    disabled={selectedAreaIds.size === 0}
                  >
                    Keine
                  </button>
                </div>
              </div>
              {allTags.length > 0 && selectedAreaIds.size > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">
                    Tag zuweisen / entfernen:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {allTags.map((tag) => (
                      <div key={tag.id} className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleBulkAssignTag(tag.id)}
                          title={`Tag „${tag.name}" zuweisen`}
                        >
                          <TagBadge
                            name={tag.name}
                            color={tag.color}
                            small
                            className="cursor-pointer hover:brightness-110"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBulkRemoveTag(tag.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title={`Tag „${tag.name}" entfernen`}
                        >
                          <IconX className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {allTags.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic">
                  Noch keine Tags vorhanden
                </p>
              )}
            </div>
          )}
          <SidebarMenu>
            {isLoading && (
              <SidebarMenuItem>
                <SidebarMenuButton disabled>Lade...</SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {!isLoading &&
              visibleAreas.length === 0 &&
              optimisticAreas.length === 0 && (
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
              visibleAreas.length === 0 &&
              (areaSearch || activeTagId !== null) && (
                <SidebarMenuItem>
                  <span className="px-2 text-xs text-muted-foreground">
                    Keine Treffer
                  </span>
                </SidebarMenuItem>
              )}
            {!isLoading &&
              !groupByTag &&
              visibleAreas.map((area) => (
                <AreaListItem
                  key={area.id}
                  area={area}
                  isEditing={editingAreaId === area.id}
                  editingAreaName={editingAreaName}
                  editInputRef={editInputRef}
                  isCurrentRoute={currentAreaIdFromRoute === String(area.id)}
                  isPinned={isPinned(area.id)}
                  isSelectable={selectMode}
                  isSelected={selectedAreaIds.has(area.id)}
                  onToggleSelect={handleToggleSelectArea}
                  onTogglePin={togglePin}
                  onStartRename={handleStartRename}
                  onConfirmRename={handleConfirmRename}
                  onCancelRename={handleCancelRename}
                  onEditNameChange={handleEditNameChange}
                  onStartDelete={handleStartDelete}
                  onDuplicate={handleDuplicate}
                  onArchive={handleArchive}
                  onEditNotes={handleEditNotes}
                  onAreaClick={handleAreaClick}
                />
              ))}
            {!isLoading &&
              groupByTag &&
              groupedByTag?.map((group) => (
                <li key={group.tag?.id ?? "no-tag"} className="list-none">
                  <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5">
                    {group.tag ? (
                      <>
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: group.tag.color }}
                        />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                          {group.tag.name}
                        </span>
                      </>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        Ohne Tag
                      </span>
                    )}
                    <span className="text-[9px] text-muted-foreground/50 ml-auto">
                      {group.areas.length}
                    </span>
                  </div>
                  {group.areas.map((area) => (
                    <AreaListItem
                      key={area.id}
                      area={area}
                      isEditing={editingAreaId === area.id}
                      editingAreaName={editingAreaName}
                      editInputRef={editInputRef}
                      isCurrentRoute={
                        currentAreaIdFromRoute === String(area.id)
                      }
                      isPinned={isPinned(area.id)}
                      isSelectable={selectMode}
                      isSelected={selectedAreaIds.has(area.id)}
                      onToggleSelect={handleToggleSelectArea}
                      onTogglePin={togglePin}
                      onStartRename={handleStartRename}
                      onConfirmRename={handleConfirmRename}
                      onCancelRename={handleCancelRename}
                      onEditNameChange={handleEditNameChange}
                      onStartDelete={handleStartDelete}
                      onDuplicate={handleDuplicate}
                      onArchive={handleArchive}
                      onEditNotes={handleEditNotes}
                      onAreaClick={handleAreaClick}
                    />
                  ))}
                </li>
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

      {/* Notes editor dialog */}
      <Dialog
        open={notesArea !== null}
        onOpenChange={(v) => {
          if (!v) setNotesArea(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Notizen — {notesArea?.name}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Notizen zu diesem Gebiet..."
            rows={5}
            className="resize-none"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNotesArea(null)}
              disabled={isSavingNotes}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSaveNotes} disabled={isSavingNotes}>
              {isSavingNotes ? "Speichere..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
