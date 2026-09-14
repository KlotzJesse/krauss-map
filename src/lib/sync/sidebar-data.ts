import { useSyncExternalStore } from "react";

import { getSidebarDataAction } from "@/app/actions/area-actions";
import type { RecentActivityItem } from "@/lib/db/data-functions";
import type { AreaSummary } from "@/lib/types/area-types";

/**
 * A live copy of the sidebar's data for the whole tab.
 *
 * The layout renders the area list once. Edits deliberately do not re-render
 * the route — that would remount the map — so anything that changes what the
 * sidebar or the page header shows calls {@link notifyAreasChanged}, and every
 * reader of {@link useLiveSidebarData} picks up the fresh copy.
 */
export interface SidebarData {
  areas: AreaSummary[];
  recentActivity: RecentActivityItem[];
}

let latest: SidebarData | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

/**
 * Bursts of edits — a radius search adding codes one layer at a time, several
 * undos in a row — collapse into one read once things go quiet.
 */
const SETTLE_MS = 500;

async function refresh(): Promise<void> {
  const mine = ++generation;
  const result = await getSidebarDataAction();
  // A newer refresh started while this one was in flight; its answer wins.
  if (mine !== generation || !result.success) {
    return;
  }
  latest = result.data;
  for (const listener of listeners) {
    listener();
  }
}

/** Something changed that the sidebar or header may show; re-read soon. */
export function notifyAreasChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    void refresh();
  }, SETTLE_MS);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Run `listener` after each refresh without re-rendering anything. For work
 * that only needs to know an edit happened, like re-reading undo counters —
 * subscribing through a hook would re-render the whole map view each time.
 */
export function onAreasRefreshed(listener: () => void): () => void {
  return subscribe(listener);
}

/**
 * One text field of one area from the live list, or `fallback` until there is
 * a live copy. Returns a string, so a refresh that leaves it unchanged does not
 * re-render the caller.
 */
export function useLiveAreaText(
  areaId: number | null | undefined,
  field: "name" | "description",
  fallback: string | null | undefined
): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => {
      const area = latest?.areas.find((a) => a.id === areaId);
      return area ? (area[field] ?? "") : fallback;
    },
    () => fallback
  );
}

/** The latest re-read, or null until the first edit on this page load. */
export function useLiveSidebarData(): SidebarData | null {
  return useSyncExternalStore(
    subscribe,
    () => latest,
    () => null
  );
}
