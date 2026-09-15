"use server";

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { FRESH_AFTER_EDIT } from "../../lib/cache/after-edit";

import { db } from "../../lib/db";
import {
  areaLayers,
  areaLayerPostalCodes,
  areaUndoStacks,
} from "../../lib/schema/schema";
import { recordChangeAction } from "./change-tracking-actions";

/** Batch-update visibility for multiple layers in a single transaction + one revalidation. */
export async function batchUpdateVisibilityAction(
  areaId: number,
  updates: { layerId: number; isVisible: boolean }[]
) {
  try {
    await db.transaction(async (tx) => {
      for (const { layerId, isVisible } of updates) {
        await tx
          .update(areaLayers)
          .set({ isVisible: isVisible ? "true" : "false" })
          .where(eq(areaLayers.id, layerId));
      }
    });

    revalidateTag(`area-${areaId}-layers`, FRESH_AFTER_EDIT);
    revalidateTag(`area-${areaId}`, FRESH_AFTER_EDIT);
    return { success: true };
  } catch (error) {
    console.error("Error batch-updating visibility:", error);
    return { success: false, error: "Failed to update visibility" };
  }
}

/**
 * Merge all postal codes from sourceLayerId into targetLayerId,
 * then delete the source layer.
 */
export async function mergeLayersAction(
  areaId: number,
  sourceLayerId: number,
  targetLayerId: number
) {
  try {
    // Fetch both layers
    const [source, target] = await Promise.all([
      db.query.areaLayers.findFirst({
        where: and(
          eq(areaLayers.id, sourceLayerId),
          eq(areaLayers.areaId, areaId)
        ),
        with: { postalCodes: true },
      }),
      db.query.areaLayers.findFirst({
        where: and(
          eq(areaLayers.id, targetLayerId),
          eq(areaLayers.areaId, areaId)
        ),
        with: { postalCodes: true },
      }),
    ]);

    if (!source || !target) {
      return { success: false, error: "Layer not found" };
    }

    const targetExistingCodes = new Set(
      target.postalCodes.map((pc) => pc.postalCode)
    );
    const codesToAdd = (source.postalCodes ?? [])
      .map((pc) => pc.postalCode)
      .filter((code) => !targetExistingCodes.has(code));

    // Insert new codes into target (skip duplicates)
    if (codesToAdd.length > 0) {
      await db
        .insert(areaLayerPostalCodes)
        .values(
          codesToAdd.map((code) => ({
            layerId: targetLayerId,
            postalCode: code,
          }))
        )
        .onConflictDoNothing();
    }

    // Delete source layer (cascade deletes its postal codes)
    await db
      .delete(areaLayers)
      .where(
        and(eq(areaLayers.id, sourceLayerId), eq(areaLayers.areaId, areaId))
      );

    await recordChangeAction(areaId, {
      changeType: "merge_layers",
      entityType: "layer",
      entityId: targetLayerId,
      changeData: {
        sourceLayerId,
        sourceLayerName: source.name,
        targetLayerId,
        targetLayerName: target.name,
        mergedCodes: codesToAdd,
      },
      previousData: {
        sourceLayer: source,
        targetLayer: target,
      },
    });

    revalidateTag(`area-${areaId}-layers`, FRESH_AFTER_EDIT);
    revalidateTag(`area-${areaId}`, FRESH_AFTER_EDIT);
    revalidateTag(`area-${areaId}-undo-redo`, FRESH_AFTER_EDIT);
    return { success: true };
  } catch (error) {
    console.error("Error merging layers:", error);
    return { success: false, error: "Failed to merge layers" };
  }
}

/**
 * Remove all postal codes belonging to a specific country from one or all layers in an area.
 * Uses the postal_codes table to identify which codes belong to the given country.
 */
export async function removePostalCodesByCountryAction(
  areaId: number,
  countryCode: string,
  layerId?: number
): Promise<{ success: boolean; data?: { removed: number }; error?: string }> {
  try {
    const layerFilter = layerId
      ? and(eq(areaLayers.areaId, areaId), eq(areaLayers.id, layerId))
      : eq(areaLayers.areaId, areaId);

    const layerRows = await db
      .select({ id: areaLayers.id })
      .from(areaLayers)
      .where(layerFilter);

    const layerIds = layerRows.map((r) => r.id);
    if (layerIds.length === 0) return { success: true, data: { removed: 0 } };

    // Find codes in those layers that belong to this country via stored-format prefix.
    // Stored format: DE→"D-xxxxx", AT→"A-xxxx", CH→"CH-xxxx"
    const prefixMap: Record<string, string> = { DE: "D-", AT: "A-", CH: "CH-" };
    const prefix = prefixMap[countryCode];
    if (!prefix) return { success: false, error: "Invalid country code" };

    const codesToRemove = await db
      .selectDistinct({ postalCode: areaLayerPostalCodes.postalCode })
      .from(areaLayerPostalCodes)
      .where(
        and(
          inArray(areaLayerPostalCodes.layerId, layerIds),
          like(areaLayerPostalCodes.postalCode, `${prefix}%`)
        )
      );

    if (codesToRemove.length === 0) {
      return { success: true, data: { removed: 0 } };
    }

    const codeList = codesToRemove.map((r) => r.postalCode);

    await db
      .delete(areaLayerPostalCodes)
      .where(
        and(
          inArray(areaLayerPostalCodes.layerId, layerIds),
          inArray(areaLayerPostalCodes.postalCode, codeList)
        )
      );

    await recordChangeAction(areaId, {
      changeType: "remove_postal_codes",
      entityType: "postal_code",
      entityId: areaId,
      changeData: { postalCodes: codeList, countryCode, layerIds },
      previousData: { postalCodes: codeList },
    });

    revalidateTag(`area-${areaId}-layers`, FRESH_AFTER_EDIT);
    revalidateTag(`area-${areaId}`, FRESH_AFTER_EDIT);
    revalidateTag(`area-${areaId}-undo-redo`, FRESH_AFTER_EDIT);

    return { success: true, data: { removed: codeList.length } };
  } catch (error) {
    console.error("removePostalCodesByCountryAction error:", error);
    return { success: false, error: "Fehler beim Entfernen der PLZ" };
  }
}

/**
 * The area's layers and undo/redo counters, read straight from the database.
 *
 * Most mutations are modelled on the client, so it can update its list without
 * asking. A few — undo, redo, restoring a version, bulk import, merging or
 * splitting layers, changing granularity — rewrite the whole set in ways the
 * client cannot predict. Those call this afterwards and replace their state
 * wholesale, which keeps the UI current without re-rendering the route. A route
 * re-render swaps the page segment and remounts the map, which is the ten
 * seconds of blank canvas this whole arrangement exists to avoid.
 */
async function readUndoRedoStatus(areaId: number) {
  const [row] = await db
    .select({
      undoCount: sql<number>`coalesce(jsonb_array_length(${areaUndoStacks.undoStack}), 0)`,
      redoCount: sql<number>`coalesce(jsonb_array_length(${areaUndoStacks.redoStack}), 0)`,
    })
    .from(areaUndoStacks)
    .where(eq(areaUndoStacks.areaId, areaId))
    .limit(1);
  const { undoCount, redoCount } = row ?? { undoCount: 0, redoCount: 0 };
  return {
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
    undoCount,
    redoCount,
  };
}

export async function getAreaLayerStateAction(areaId: number) {
  try {
    const [layerRows, undoRedo] = await Promise.all([
      db.query.areaLayers.findMany({
        where: eq(areaLayers.areaId, areaId),
        with: { postalCodes: { columns: { postalCode: true } } },
        orderBy: (layers, { asc }) => [asc(layers.orderIndex)],
      }),
      readUndoRedoStatus(areaId),
    ]);

    return {
      success: true as const,
      data: {
        layers: layerRows.map(({ postalCodes: codes, ...layer }) => ({
          ...layer,
          codes: codes.map((entry) => entry.postalCode),
        })),
        undoRedo,
      },
    };
  } catch (error) {
    console.error("Error reading area layer state:", error);
    return { success: false as const, error: "Failed to read layers" };
  }
}

/**
 * Just the undo/redo counters. Edits made outside the map — renaming the area
 * or writing notes in the sidebar — are undoable too, and without this the open
 * page kept its undo button disabled until a reload.
 */
export async function getUndoRedoStatusAction(areaId: number) {
  try {
    return { success: true as const, data: await readUndoRedoStatus(areaId) };
  } catch (error) {
    console.error("Error reading undo/redo status:", error);
    return { success: false as const, error: "Failed to read undo status" };
  }
}
