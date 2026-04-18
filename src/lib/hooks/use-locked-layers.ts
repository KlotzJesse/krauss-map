"use client";

import { useCallback, useEffect, useState } from "react";

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

  // Sync from storage when areaId changes
  useEffect(() => {
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

  const isLocked = useCallback(
    (layerId: number) => lockedLayerIds.has(layerId),
    [lockedLayerIds]
  );

  return { lockedLayerIds, toggleLock, isLocked };
}
