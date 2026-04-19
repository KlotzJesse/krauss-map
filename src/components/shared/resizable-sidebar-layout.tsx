"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SidebarProvider } from "@/components/ui/sidebar";

const STORAGE_KEY = "sidebar-width-px";
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288; // ~calc(var(--spacing) * 72) = 18rem = 288px

interface ResizableSidebarLayoutProps {
  children: React.ReactNode;
  headerHeight?: string;
}

export function ResizableSidebarLayout({
  children,
  headerHeight = "calc(var(--spacing) * 12)",
}: ResizableSidebarLayoutProps) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return isNaN(parsed)
      ? DEFAULT_WIDTH
      : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed));
  });

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - startX.current;
    const newWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, startWidth.current + delta)
    );
    setWidth(newWidth);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    const delta = e.clientX - startX.current;
    const newWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, startWidth.current + delta)
    );
    localStorage.setItem(STORAGE_KEY, String(newWidth));
  }, []);

  // Sync to localStorage on width change (debounced via pointer up)
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(width));
    }
  }, [width]);

  const sidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": `${width}px`,
        "--header-height": headerHeight,
      }) as React.CSSProperties,
    [width, headerHeight]
  );

  return (
    <SidebarProvider style={sidebarStyle}>
      {children}
      {/* Drag handle overlaid on the sidebar edge */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="fixed top-0 bottom-0 z-50 w-1 cursor-col-resize group select-none"
        style={{ left: `${width - 2}px` }}
        title="Sidebar-Breite ändern"
      >
        <div className="absolute inset-0 group-hover:bg-primary/30 transition-colors" />
      </div>
    </SidebarProvider>
  );
}
