"use client";

import { useState, useCallback, useEffect, useRef } from "react";

import { useStableCallback } from "@/lib/hooks/use-stable-callback";

const STORAGE_KEY = "pinned-area-ids";

function readPins(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as number[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function writePins(pins: Set<number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...pins]));
  } catch {
    // ignore
  }
}

export function useAreaPins() {
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  // pinnedRef always reflects the latest Set so stable isPinned reads current state
  const pinnedRef = useRef<Set<number>>(new Set());

  // Load from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    const pins = readPins();
    pinnedRef.current = pins;
    // Only trigger a re-render if there are actually pinned items to show
    if (pins.size > 0) {
      setPinnedIds(pins);
    }
  }, []);

  // Stable reference — reads from ref, never changes identity between renders
  const isPinned = useStableCallback((id: number) => pinnedRef.current.has(id));

  const togglePin = useCallback((id: number) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      pinnedRef.current = next;
      writePins(next);
      return next;
    });
  }, []);

  return { pinnedIds, isPinned, togglePin };
}
