"use server";

import { and, eq, inArray, like, or } from "drizzle-orm";
import { updateTag } from "next/cache";

import {
  type CountryCode,
  detectCountryFromCode,
  formatWithPrefix,
} from "../../lib/config/countries";
import { db } from "../../lib/db";
import {
  areas,
  areaLayers,
  areaLayerPostalCodes,
  postalCodes,
} from "../../lib/schema/schema";
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
  inputCodes: string[],
  createdBy?: string
) {
  try {
    // Load area for country/granularity context needed for normalization
    const area = await db.query.areas.findFirst({
      where: eq(areas.id, areaId),
      columns: { country: true, granularity: true },
    });
    const areaCountry = (area?.country ?? "DE") as CountryCode;
    const areaGranularity = area?.granularity ?? "5digit";

    // Get existing postal codes for this layer (already in stored format after migration)
    const layer = await db.query.areaLayers.findFirst({
      where: eq(areaLayers.id, layerId),
      with: {
        postalCodes: { columns: { postalCode: true } },
      },
    });

    if (!layer) {
      return { success: false, error: "Layer not found" };
    }

    const existingCodesSet = new Set(
      layer.postalCodes?.map((pc) => pc.postalCode) ?? []
    );

    // Normalize incoming codes: detect country prefix, convert to stored format
    const normalized = inputCodes
      .map((code) => {
        const detected = detectCountryFromCode(code);
        const country = (detected.country ?? areaCountry) as CountryCode;
        const rawCode = detected.code;
        if (!rawCode || rawCode.length < 1 || rawCode.length > 6) return null;
        const storedCode = formatWithPrefix(rawCode, country);
        return { rawCode, country, storedCode };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const toAdd = normalized.filter(
      ({ storedCode }) => !existingCodesSet.has(storedCode)
    );

    if (toAdd.length === 0) {
      return { success: true };
    }

    // Group by country for efficient postalCodeId look up
    const byCountry = new Map<CountryCode, string[]>();
    for (const { rawCode, country } of toAdd) {
      const arr = byCountry.get(country) ?? [];
      arr.push(rawCode);
      byCountry.set(country, arr);
    }

    // Bulk look up postalCodeId for each (country, rawCode) pair
    const postalCodeIdMap = new Map<string, number>(); // "country:rawCode" → id
    for (const [country, rawCodes] of byCountry) {
      const rows = await db
        .select({ id: postalCodes.id, code: postalCodes.code })
        .from(postalCodes)
        .where(
          and(
            inArray(postalCodes.code, rawCodes),
            eq(postalCodes.country, country),
            eq(postalCodes.granularity, areaGranularity)
          )
        );
      for (const row of rows) {
        postalCodeIdMap.set(`${country}:${row.code}`, row.id);
      }
    }

    // Build insert rows with stored-format postalCode and populated postalCodeId
    const insertRows = toAdd.map(({ rawCode, country, storedCode }) => ({
      layerId,
      postalCode: storedCode,
      postalCodeId: postalCodeIdMap.get(`${country}:${rawCode}`) ?? null,
    }));

    await db
      .insert(areaLayerPostalCodes)
      .values(insertRows)
      .onConflictDoNothing();

    const codesToAddStored = insertRows.map((r) => r.postalCode);

    await recordChangeAction(areaId, {
      changeType: "add_postal_codes",
      entityType: "postal_code",
      entityId: layerId,
      changeData: {
        postalCodes: codesToAddStored,
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
      target.postalCodes?.map((pc) => pc.postalCode) ?? []
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

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-undo-redo`);
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

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-undo-redo`);

    return { success: true, data: { removed: codeList.length } };
  } catch (error) {
    console.error("removePostalCodesByCountryAction error:", error);
    return { success: false, error: "Fehler beim Entfernen der PLZ" };
  }
}
