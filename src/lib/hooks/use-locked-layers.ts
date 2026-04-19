"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useStableCallback } from "./use-stable-callback";

const STORAGE_KEY_PREFIX = "lockedLayers:";

function getStorageKey(areaId: number | string): string {
  return `${STORAGE_KEY_PREFIX}${areaId}`;
}

function readFromStorage(areaId: number | string): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(getStorageKey(areaId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as number[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function writeToStorage(areaId: number | string, locked: Set<number>): void {
  try {
    localStorage.setItem(getStorageKey(areaId), JSON.stringify([...locked]));
  } catch {
    // localStorage might be full/unavailable
  }
}

export function useLockedLayers(areaId: number | string) {
  const [lockedLayerIds, setLockedLayerIds] = useState<Set<number>>(() =>
    readFromStorage(areaId)
  );
  // Ref for stable isLocked reads without recreating the callback
  const lockedRef = useRef(lockedLayerIds);
  lockedRef.current = lockedLayerIds;

  // Sync from storage when areaId changes, skip the initial mount
  // (the useState initializer already read from storage on mount)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    setLockedLayerIds(readFromStorage(areaId));
  }, [areaId]);

  const toggleLock = useCallback(
    (layerId: number) => {
      setLockedLayerIds((prev) => {
        const next = new Set(prev);
        if (next.has(layerId)) {
          next.delete(layerId);
        } else {
          next.add(layerId);
        }
        writeToStorage(areaId, next);
        return next;
      });
    },
    [areaId]
  );

  // Stable reference — always reads from the latest lockedLayerIds via ref
  const isLocked = useStableCallback((layerId: number) =>
    lockedRef.current.has(layerId)
  );

  return { lockedLayerIds, toggleLock, isLocked };
}
