"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useStableCallback } from "./use-stable-callback";

const STORAGE_KEY_PREFIX = "lockedLayers:";
const EMPTY: ReadonlySet<number> = new Set();

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

/**
 * One shared copy of the locks per area for the whole tab.
 *
 * The hook used to keep its own state per call. The layer panel (which toggles
 * locks) and the tools component (which refuses writes to locked layers) each
 * called it, so locking a layer updated the panel's copy only — the guard kept
 * the state it read at mount and let codes into a "locked" layer until reload.
 * Other tabs are kept in step through the storage event.
 */
const snapshots = new Map<string, Set<number>>();
const listeners = new Set<() => void>();

function getLocked(areaId: number | string): ReadonlySet<number> {
  const key = getStorageKey(areaId);
  let locked = snapshots.get(key);
  if (!locked) {
    locked = readFromStorage(areaId);
    snapshots.set(key, locked);
  }
  return locked;
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function onStorage(event: StorageEvent): void {
  if (event.key?.startsWith(STORAGE_KEY_PREFIX)) {
    snapshots.delete(event.key);
    emit();
  }
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function useLockedLayers(areaId: number | string) {
  const lockedLayerIds = useSyncExternalStore(
    subscribe,
    () => getLocked(areaId),
    () => EMPTY
  );

  const toggleLock = useCallback(
    (layerId: number) => {
      const next = new Set(getLocked(areaId));
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      snapshots.set(getStorageKey(areaId), next);
      writeToStorage(areaId, next);
      emit();
    },
    [areaId]
  );

  // Stable reference that always reads the shared, current locks.
  const isLocked = useStableCallback((layerId: number) =>
    getLocked(areaId).has(layerId)
  );

  return { lockedLayerIds, toggleLock, isLocked };
}
