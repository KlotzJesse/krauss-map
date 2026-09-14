/**
 * The cache profile every Server Action passes to `revalidateTag`.
 *
 * Next.js offers three ways to invalidate from an action, and two of them are
 * wrong for this app:
 *
 * - `updateTag(tag)` and `revalidateTag(tag, { expire: 0 })` mark the action as
 *   having revalidated the path, so its response re-renders the current route.
 *   That swaps the page segment and remounts the map — ten seconds of blank
 *   canvas after every edit. (next/dist/server/web/spec-extension/revalidate.js
 *   sets `pathWasRevalidated` only when there is no profile or `expire === 0`.)
 * - `revalidateTag(tag, "max")` avoids the re-render but serves the stale entry
 *   to the next request while it revalidates in the background, so reloading
 *   right after renaming an area could show the old name.
 *
 * `{ expire: 1 }` sits between them: no re-render, and the stale entry is only
 * usable for one second, after which a request waits for fresh data. The open
 * page does not depend on this at all — it applies its own edits immediately —
 * this only keeps the next page load honest.
 */
export const FRESH_AFTER_EDIT = { expire: 1 } as const;
