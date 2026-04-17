"use server";

import { and, eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";

import { db } from "../../lib/db";
import { areaLayers, areaLayerPostalCodes } from "../../lib/schema/schema";
import { recordChangeAction } from "./change-tracking-actions";

export async function createLayerAction(
  areaId: number,
  data: {
    name: string;
    color?: string;
    opacity?: number;
    isVisible?: boolean | string;
    orderIndex?: number;
  },
  createdBy?: string
) {
  try {
    const isVisibleStr =
      data.isVisible === undefined ? "true" : String(data.isVisible);

    const [layer] = await db
      .insert(areaLayers)
      .values({
        areaId,
        name: data.name.slice(0, 31),
        color: data.color || "#3b82f6",
        opacity: data.opacity ?? 80,
        isVisible: isVisibleStr,
        orderIndex: data.orderIndex ?? 0,
      })
      .returning();

    // Record change
    await recordChangeAction(areaId, {
      changeType: "create_layer",
      entityType: "layer",
      entityId: layer.id,
      changeData: {
        layer: {
          areaId,
          name: data.name,
          color: data.color || "#3b82f6",
          opacity: data.opacity ?? 80,
          isVisible: isVisibleStr,
          orderIndex: data.orderIndex ?? 0,
        },
      },
      createdBy,
    });

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-undo-redo`);

    return { success: true, data: { id: layer.id } };
  } catch (error) {
    console.error("Error creating layer:", error);
    return { success: false, error: "Failed to create layer" };
  }
}

export async function updateLayerAction(
  areaId: number,
  layerId: number,
  data: {
    name?: string;
    color?: string;
    opacity?: number;
    isVisible?: boolean | string;
    orderIndex?: number;
    postalCodes?: string[];
  },
  createdBy?: string
) {
  try {
    // Get previous state
    const previousLayer = await db.query.areaLayers.findFirst({
      where: eq(areaLayers.id, layerId),
      with: { postalCodes: true },
    });

    await db.transaction(async (tx) => {
      // Update layer properties
      const updates: Record<string, string | number> = {};
      if (data.name !== undefined) {
        updates.name = data.name.slice(0, 31);
      }
      if (data.color !== undefined) {
        updates.color = data.color;
      }
      if (data.opacity !== undefined) {
        updates.opacity = data.opacity;
      }
      if (data.isVisible !== undefined) {
        updates.isVisible = String(data.isVisible);
      }
      if (data.orderIndex !== undefined) {
        updates.orderIndex = data.orderIndex;
      }

      if (Object.keys(updates).length > 0) {
        await tx
          .update(areaLayers)
          .set(updates)
          .where(eq(areaLayers.id, layerId));
      }

      // Update postal codes if provided
      if (data.postalCodes !== undefined) {
        // Delete existing postal codes
        await tx
          .delete(areaLayerPostalCodes)
          .where(eq(areaLayerPostalCodes.layerId, layerId));

        // Insert new postal codes
        if (data.postalCodes.length > 0) {
          await tx.insert(areaLayerPostalCodes).values(
            data.postalCodes.map((code: string) => ({
              layerId,
              postalCode: code,
            }))
          );
        }
      }
    });

    // Record change
    const changeData: Record<string, unknown> = {};
    const previousData: Record<string, unknown> = {};

    if (data.name !== undefined) {
      changeData.name = data.name;
      previousData.name = previousLayer?.name;
    }
    if (data.color !== undefined) {
      changeData.color = data.color;
      previousData.color = previousLayer?.color;
    }
    if (data.opacity !== undefined) {
      changeData.opacity = data.opacity;
      previousData.opacity = previousLayer?.opacity;
    }
    if (data.isVisible !== undefined) {
      changeData.isVisible = String(data.isVisible);
      previousData.isVisible = previousLayer?.isVisible;
    }
    if (data.orderIndex !== undefined) {
      changeData.orderIndex = data.orderIndex;
      previousData.orderIndex = previousLayer?.orderIndex;
    }
    if (data.postalCodes !== undefined) {
      changeData.postalCodes = data.postalCodes;
      previousData.postalCodes =
        previousLayer?.postalCodes?.map((pc) => pc.postalCode) || [];
    }

    await recordChangeAction(areaId, {
      changeType: "update_layer",
      entityType: "layer",
      entityId: layerId,
      changeData,
      previousData,
      createdBy,
    });

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-undo-redo`);
    return { success: true };
  } catch (error) {
    console.error("Error updating layer:", error);
    return { success: false, error: "Failed to update layer" };
  }
}

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

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    return { success: true };
  } catch (error) {
    console.error("Error batch-updating visibility:", error);
    return { success: false, error: "Failed to update visibility" };
  }
}

export async function deleteLayerAction(
  areaId: number,
  layerId: number,
  createdBy?: string
) {
  try {
    // Get layer data before deletion
    const layer = await db.query.areaLayers.findFirst({
      where: eq(areaLayers.id, layerId),
      with: {
        postalCodes: true,
      },
    });

    if (!layer) {
      return { success: false, error: "Layer not found" };
    }

    await db.transaction(async (tx) => {
      // Delete postal codes first (foreign key constraint)
      await tx
        .delete(areaLayerPostalCodes)
        .where(eq(areaLayerPostalCodes.layerId, layerId));

      // Delete the layer
      await tx.delete(areaLayers).where(eq(areaLayers.id, layerId));
    });

    // Record change
    await recordChangeAction(areaId, {
      changeType: "delete_layer",
      entityType: "layer",
      entityId: layerId,
      changeData: {},
      previousData: {
        layer: {
          id: layer.id,
          areaId: layer.areaId,
          name: layer.name,
          color: layer.color,
          opacity: layer.opacity,
          isVisible: layer.isVisible,
          orderIndex: layer.orderIndex,
        },
        postalCodes: layer.postalCodes?.map((pc) => pc.postalCode) || [],
      },
      createdBy,
    });

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-undo-redo`);
    return { success: true };
  } catch (error) {
    console.error("Error deleting layer:", error);
    return { success: false, error: "Failed to delete layer" };
  }
}

export async function addPostalCodesToLayerAction(
  areaId: number,
  layerId: number,
  postalCodes: string[],
  createdBy?: string
) {
  try {
    // Get existing postal codes for this layer
    const layer = await db.query.areaLayers.findFirst({
      where: eq(areaLayers.id, layerId),
      with: {
        postalCodes: true,
      },
    });

    if (!layer) {
      return { success: false, error: "Layer not found" };
    }

    const existingCodesSet = new Set(
      layer.postalCodes?.map((pc) => pc.postalCode) ?? []
    );
    const codesToAdd = postalCodes.filter(
      (code) => !existingCodesSet.has(code)
    );

    if (codesToAdd.length === 0) {
      return { success: true }; // No new codes to add
    }

    // Delta insert only new codes — uses unique constraint to skip duplicates
    await db
      .insert(areaLayerPostalCodes)
      .values(codesToAdd.map((code) => ({ layerId, postalCode: code })))
      .onConflictDoNothing();

    // Record change
    await recordChangeAction(areaId, {
      changeType: "add_postal_codes",
      entityType: "postal_code",
      entityId: layerId,
      changeData: {
        postalCodes: codesToAdd,
        layerId,
      },
      previousData: {
        postalCodes: [...existingCodesSet],
      },
      createdBy,
    });

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-undo-redo`);
    return { success: true };
  } catch (error) {
    console.error("Error adding postal codes to layer:", error);
    return { success: false, error: "Failed to add postal codes" };
  }
}

export async function removePostalCodesFromLayerAction(
  areaId: number,
  layerId: number,
  postalCodes: string[],
  createdBy?: string
) {
  try {
    // Get existing postal codes for this layer
    const layer = await db.query.areaLayers.findFirst({
      where: eq(areaLayers.id, layerId),
      with: {
        postalCodes: true,
      },
    });

    if (!layer) {
      return { success: false, error: "Layer not found" };
    }

    const existingCodesSet = new Set(
      layer.postalCodes?.map((pc) => pc.postalCode) ?? []
    );
    const codesToRemove = postalCodes.filter((code) =>
      existingCodesSet.has(code)
    );

    if (codesToRemove.length === 0) {
      return { success: true }; // No codes to remove
    }

    // Delta delete only the specified codes
    await db
      .delete(areaLayerPostalCodes)
      .where(
        and(
          eq(areaLayerPostalCodes.layerId, layerId),
          inArray(areaLayerPostalCodes.postalCode, codesToRemove)
        )
      );

    // Record change
    await recordChangeAction(areaId, {
      changeType: "remove_postal_codes",
      entityType: "postal_code",
      entityId: layerId,
      changeData: {
        postalCodes: codesToRemove,
        layerId,
      },
      previousData: {
        postalCodes: codesToRemove, // Store removed codes for undo
      },
      createdBy,
    });

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-undo-redo`);
    return { success: true };
  } catch (error) {
    console.error("Error removing postal codes from layer:", error);
    return { success: false, error: "Failed to remove postal codes" };
  }
}
