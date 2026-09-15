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

function scheduleRefresh(): void {
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    void refresh();
  }, SETTLE_MS);
}

/**
 * Tabs of this app tell each other about edits. Without it a second tab — the
 * same user comparing two areas, say — showed stale counts and layers until it
 * was reloaded, because every refresh here is triggered by an edit in the same
 * tab.
 */
const CHANNEL_NAME = "krauss-map-sync";
let channel: BroadcastChannel | null = null;
const remoteListeners = new Set<() => void>();

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") {
    return channel;
  }
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", () => {
    // Refresh here without broadcasting again, or two tabs would echo forever.
    scheduleRefresh();
    for (const listener of remoteListeners) {
      listener();
    }
  });
  return channel;
}

/**
 * Something changed that the sidebar or header may show; re-read soon.
 *
 * Pass `broadcast: false` when the change came from another tab in the first
 * place, so tabs do not bounce the same edit back and forth.
 */
export function notifyAreasChanged(options: { broadcast?: boolean } = {}): void {
  if (typeof window === "undefined") {
    return;
  }
  scheduleRefresh();
  if (options.broadcast !== false) {
    getChannel()?.postMessage({ type: "areas-changed" });
  }
}

/**
 * Run `listener` when another tab reports an edit. The open area page uses it
 * to check whether its own area was the one that changed.
 */
export function onRemoteAreasChanged(listener: () => void): () => void {
  getChannel();
  remoteListeners.add(listener);
  return () => {
    remoteListeners.delete(listener);
  };
}

let lastFocusRefresh = 0;
/**
 * Re-read when the tab comes back into view. Edits by other people never pass
 * through this tab at all; returning to it is the natural moment to catch up.
 * Throttled so switching windows back and forth does not hammer the server.
 */
export function refreshOnReturn(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  getChannel();
  const onReturn = () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    const now = Date.now();
    if (now - lastFocusRefresh < 15_000) {
      return;
    }
    lastFocusRefresh = now;
    scheduleRefresh();
  };
  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("focus", onReturn);
  return () => {
    document.removeEventListener("visibilitychange", onReturn);
    window.removeEventListener("focus", onReturn);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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

/**
 * One area's tags from the live list, as a JSON signature (stable while the
 * tags are unchanged), or null until there is a live copy.
 */
export function useLiveAreaTagsSignature(
  areaId: number | null | undefined
): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const area = latest?.areas.find((a) => a.id === areaId);
      return area ? JSON.stringify(area.tags ?? []) : null;
    },
    () => null
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
