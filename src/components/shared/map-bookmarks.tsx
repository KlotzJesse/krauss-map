"use client";

import {
  IconBookmark,
  IconBookmarkFilled,
  IconMapPin,
  IconPencil,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "map-bookmarks-v1";
const MAX_NAME_LENGTH = 40;

interface Bookmark {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  createdAt: number;
}

function loadBookmarks(): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: Bookmark[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

interface MapBookmarksProps {
  getCurrentView: () => { center: [number, number]; zoom: number };
  onJumpTo: (center: [number, number], zoom: number) => void;
}

export function MapBookmarks({ getCurrentView, onJumpTo }: MapBookmarksProps) {
  const [open, setOpen] = useState(false);
  const [currentView, setCurrentView] = useState<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  // Load on open
  useEffect(() => {
    if (open) {
      setBookmarks(loadBookmarks());
      setCurrentView(getCurrentView());
    }
  }, [open, getCurrentView]);

  // Keyboard shortcut: Ctrl+B / Cmd+B toggles bookmarks panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const addBookmark = useCallback(() => {
    const view = currentView ?? getCurrentView();
    const name =
      newName.trim() || `Lesezeichen ${new Date().toLocaleTimeString("de-DE")}`;
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      name,
      center: view.center,
      zoom: view.zoom,
      createdAt: Date.now(),
    };
    const updated = [bookmark, ...bookmarks].slice(0, 20);
    setBookmarks(updated);
    saveBookmarks(updated);
    setIsAdding(false);
    setNewName("");
  }, [newName, currentView, getCurrentView, bookmarks]);

  const deleteBookmark = useCallback(
    (id: string) => {
      const updated = bookmarks.filter((b) => b.id !== id);
      setBookmarks(updated);
      saveBookmarks(updated);
    },
    [bookmarks]
  );

  const startEdit = useCallback((b: Bookmark) => {
    setEditingId(b.id);
    setEditName(b.name);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId) return;
    const updated = bookmarks.map((b) =>
      b.id === editingId ? { ...b, name: editName.trim() || b.name } : b
    );
    setBookmarks(updated);
    saveBookmarks(updated);
    setEditingId(null);
  }, [editingId, editName, bookmarks]);

  const jumpTo = useCallback(
    (b: Bookmark) => {
      onJumpTo(b.center, b.zoom);
      setOpen(false);
    },
    [onJumpTo]
  );

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Kartenlesezeichen (Ctrl+B)"
        aria-label="Kartenlesezeichen öffnen"
        className="flex items-center justify-center w-8 h-8 rounded-md bg-white/90 border border-border shadow-sm hover:bg-white transition-colors text-muted-foreground hover:text-foreground"
      >
        {bookmarks.length > 0 ? (
          <IconBookmarkFilled className="h-4 w-4 text-amber-500" />
        ) : (
          <IconBookmark className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-64 bg-white border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
            <span className="text-xs font-semibold text-foreground">
              Kartenlesezeichen
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Schließen"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {bookmarks.length === 0 && !isAdding && (
              <p className="text-xs text-muted-foreground text-center py-4 px-3">
                Keine Lesezeichen gespeichert
              </p>
            )}
            {bookmarks.map((b) => (
              <div
                key={b.id}
                className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 border-b border-border/50 last:border-0"
              >
                <IconMapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {editingId === b.id ? (
                  <input
                    autoFocus
                    value={editName}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={saveEdit}
                    className="flex-1 text-xs bg-transparent border-b border-primary outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    className="flex-1 text-xs text-left truncate hover:text-primary transition-colors"
                    onClick={() => jumpTo(b)}
                    title={`Zoom ${Math.round(b.zoom)} · ${b.center[1].toFixed(4)}, ${b.center[0].toFixed(4)}`}
                  >
                    {b.name}
                  </button>
                )}
                <div className="shrink-0 opacity-0 group-hover:opacity-100 flex gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(b)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Umbenennen"
                  >
                    <IconPencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBookmark(b.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Löschen"
                  >
                    <IconTrash className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-2">
            {isAdding ? (
              <div className="flex gap-1.5">
                <input
                  ref={newInputRef}
                  autoFocus
                  value={newName}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder="Name (optional)"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addBookmark();
                    if (e.key === "Escape") {
                      setIsAdding(false);
                      setNewName("");
                    }
                  }}
                  className="flex-1 text-xs border border-border rounded px-2 py-1 outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addBookmark}
                  className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="w-full text-xs text-center text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded py-1 transition-colors"
                disabled={bookmarks.length >= 20}
              >
                + Aktuelle Position speichern
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
