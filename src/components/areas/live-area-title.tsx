"use client";

import { useLiveAreaText } from "@/lib/sync/sidebar-data";

/**
 * The open area's name, kept current after a rename.
 *
 * The page renders the name on the server, and renaming no longer re-renders
 * the route, so the header would keep the old name until a reload. Once any
 * edit has refreshed the live area list, this shows the name from there.
 */
export function LiveAreaTitle({
  areaId,
  fallback,
}: {
  areaId: number;
  fallback: string;
}) {
  return <>{useLiveAreaText(areaId, "name", fallback) || fallback}</>;
}
