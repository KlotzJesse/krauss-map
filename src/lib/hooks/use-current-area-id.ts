"use client";

import { usePathname } from "next/navigation";

/**
 * Extracts the current area ID from the pathname (e.g. /postal-codes/123 -> 123).
 *
 * Designed to be called inside individual AreaListItems so that only the items
 * whose `isCurrentRoute` value actually changes will re-render — instead of
 * having a parent component subscribe to pathname and propagate changes to
 * all 33+ items.
 */

const POSTAL_CODES_REGEX = /\/postal-codes\/(\d+)/;

function parseAreaIdFromPathname(pathname: string | null): number | null {
  if (!pathname) return null;
  const match = pathname.match(POSTAL_CODES_REGEX);
  return match ? Number(match[1]) : null;
}

/**
 * Returns the current area ID parsed from the URL pathname.
 * Only triggers a re-render when the area ID actually changes.
 */
export function useCurrentAreaId(): number | null {
  const pathname = usePathname();
  return parseAreaIdFromPathname(pathname);
}

/**
 * Returns true if the given area ID matches the current route.
 * Only triggers a re-render when the boolean result changes for this specific area.
 */
export function useIsCurrentArea(areaId: number): boolean {
  const currentAreaId = useCurrentAreaId();
  return currentAreaId === areaId;
}
