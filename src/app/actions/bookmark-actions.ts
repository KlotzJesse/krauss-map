"use server";

import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { mapBookmarks } from "@/lib/schema/schema";

export async function getBookmarksAction() {
  const rows = await db
    .select()
    .from(mapBookmarks)
    .orderBy(desc(mapBookmarks.createdAt));
  return rows;
}

export async function createBookmarkAction(
  name: string,
  longitude: number,
  latitude: number,
  zoom: number
) {
  const [row] = await db
    .insert(mapBookmarks)
    .values({
      name:
        name.trim() || `Lesezeichen ${new Date().toLocaleTimeString("de-DE")}`,
      longitude: String(longitude),
      latitude: String(latitude),
      zoom: String(zoom),
    })
    .returning();
  return row;
}

export async function deleteBookmarkAction(id: number) {
  await db.delete(mapBookmarks).where(eq(mapBookmarks.id, id));
}

export async function updateBookmarkNameAction(id: number, name: string) {
  const [row] = await db
    .update(mapBookmarks)
    .set({ name: name.trim() })
    .where(eq(mapBookmarks.id, id))
    .returning();
  return row;
}
