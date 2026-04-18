"use client";

import { useState, useCallback, useEffect } from "react";

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

  // Load from localStorage only after hydration to avoid SSR mismatch
  useEffect(() => {
    setPinnedIds(readPins());
  }, []);

  const isPinned = useCallback((id: number) => pinnedIds.has(id), [pinnedIds]);

  const togglePin = useCallback((id: number) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writePins(next);
      return next;
    });
  }, []);

  return { pinnedIds, isPinned, togglePin };
}
