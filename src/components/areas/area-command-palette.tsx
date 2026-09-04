"use client";

import { IconSearch } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import type { AreaSummary } from "@/lib/types/area-types";

// cmdk's matching machinery plus the dialog behind a shortcut most sessions
// never press. Deferring it keeps it out of the first load; the trigger and the
// shortcut handler below stay eager, so the first Cmd/Ctrl+K still responds —
// it flips `open`, which mounts the lazy element.
const AreaCommandDialog = lazy(() => import("./area-command-dialog"));

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const SHORTCUT_LABEL = isMac ? "⌘K" : "Strg K";

interface AreaCommandPaletteProps {
  areas: AreaSummary[];
  onCreateArea?: () => void;
}

/**
 * The single sidebar search: one trigger for both areas and postal codes,
 * replacing the separate "PLZ suchen" and "Gebiete filtern" inputs.
 *
 * `mounted` latches instead of rendering on `open` alone: unmounting the dialog
 * the moment `open` flips false would cut its exit transition, so once the
 * chunk has been requested the dialog stays mounted and `open` drives it.
 */
export function AreaCommandPalette({
  areas,
  onCreateArea,
}: AreaCommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // "/" opens the palette too, unless the user is typing in a field.
      if (e.key === "/" && !(e.metaKey || e.ctrlKey || e.altKey)) {
        const t = e.target as HTMLElement | null;
        const editing =
          !!t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.tagName === "SELECT" ||
            t.isContentEditable);
        if (!editing) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Warm the chunk on hover so the mouse path never waits.
        onMouseEnter={() => void import("./area-command-dialog")}
        className="flex w-full items-center gap-2 rounded-md border border-border/50 bg-sidebar-accent px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Gebiet oder PLZ suchen"
      >
        <IconSearch className="h-4 w-4 shrink-0" />
        <span className="truncate">Gebiet oder PLZ suchen…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">{SHORTCUT_LABEL}</Kbd>
      </button>

      {/* fallback null: the palette is an overlay, so there is nothing to
          reserve space for and nothing on screen to blank out. */}
      {mounted ? (
        <Suspense fallback={null}>
          <AreaCommandDialog
            open={open}
            onOpenChange={setOpen}
            areas={areas}
            {...(onCreateArea ? { onCreateArea } : {})}
          />
        </Suspense>
      ) : null}
    </>
  );
}
