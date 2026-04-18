"use server";

import { eq, and, inArray, sql } from "drizzle-orm";
import type { Route } from "next";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "../../lib/db";
import {
  areas,
  areaLayers,
  areaLayerPostalCodes,
  postalCodes,
  layerTemplates,
  areaTags,
  areaTagAssignments,
  type SelectLayerTemplates,
} from "../../lib/schema/schema";
import { generateNextColor } from "../../lib/utils/layer-colors";
import {
  recordChangeAction,
  recordChangeWithTx,
} from "./change-tracking-actions";
import { createVersionAction } from "./version-actions";

type ServerActionResponse<T = void> = Promise<{
  success: boolean;

  data?: T;

  error?: string;
}>;

interface Result {
  place_id: string;

  display_name: string;

  lon: string;

  lat: string;

  address: {
    postcode: string;

    city: string;

    town: string;

    village: string;

    state: string;

    country: string;
  };
}

// ===============================

// AREA OPERATIONS

// ===============================
export async function createAreaAction(data: {
  name: string;

  description?: string;

  granularity?: string;

  country?: string;

  createdBy?: string;
}) {
  let redirectPath: string | null = null;

  try {
    const [area] = await db

      .insert(areas)

      .values({
        name: data.name,

        description: data.description,

        granularity: data.granularity || "5digit",

        country: data.country || "DE",
      })

      .returning();

    const versionResult = await createVersionAction(area.id, {
      name: "Erstversion",

      description: "Automatically created first version",

      createdBy: data.createdBy,
    });

    if (!versionResult.success) {
      await db.delete(areas).where(eq(areas.id, area.id));

      throw new Error("Erstversion konnte nicht erstellt werden");
    }

    updateTag("areas");

    updateTag(`area-${area.id}`);

    updateTag(`area-${area.id}-undo-redo`);

    updateTag("version-info");

    updateTag(`area-${area.id}-version-info`);

    redirectPath = `/postal-codes/${area.id}`;
  } catch (error) {
    console.error("Error creating area:", error);

    return { success: false, error: "Failed to create area" };
  } finally {
    if (redirectPath) {
      redirect(redirectPath as Route);
    }
  }
}

export async function updateAreaAction(
  id: number,

  data: {
    name?: string;

    description?: string;

    granularity?: string;
  },

  createdBy?: string
): ServerActionResponse {
  try {
    // Get previous state

    const previousArea = await db.query.areas.findFirst({
      where: eq(areas.id, id),
    });

    await db

      .update(areas)

      .set({
        ...data,

        updatedAt: new Date().toISOString(),
      })

      .where(eq(areas.id, id));

    // Record change

    await recordChangeAction(id, {
      changeType: "update_area",

      entityType: "area",

      entityId: id,

      changeData: data,

      previousData: previousArea
        ? {
            name: previousArea.name,

            description: previousArea.description,

            granularity: previousArea.granularity,
          }
        : undefined,

      createdBy,
    });

    updateTag("areas");

    updateTag(`area-${id}`);

    updateTag(`area-${id}-undo-redo`);

    return { success: true };
  } catch (error) {
    console.error("Error updating area:", error);

    return { success: false, error: "Failed to update area" };
  }
}

export async function deleteAreaAction(id: number) {
  let redirectPath: string | null = null;

  try {
    // Delete in correct order due to foreign key constraints

    await db.transaction(async (tx) => {
      // First delete all postal codes from layers in this area

      const areaLayerIds = await tx

        .select({ id: areaLayers.id })

        .from(areaLayers)

        .where(eq(areaLayers.areaId, id));

      if (areaLayerIds.length > 0) {
        await tx.delete(areaLayerPostalCodes).where(
          inArray(
            areaLayerPostalCodes.layerId,

            areaLayerIds.map((l) => l.id)
          )
        );

        // Then delete the layers

        await tx.delete(areaLayers).where(eq(areaLayers.areaId, id));
      }

      // Finally delete the area

      await tx.delete(areas).where(eq(areas.id, id));
    });

    updateTag("areas");

    // Set redirect path for finally block
    redirectPath = "/postal-codes";
  } catch (error) {
    console.error("Error deleting area:", error);

    return { success: false, error: "Failed to delete area" };
  } finally {
    // Redirect in finally block for cleaner resource management
    if (redirectPath) {
      redirect(redirectPath as Route);
    }
  }
}

export async function archiveAreaAction(
  id: number,
  archive: boolean
): ServerActionResponse {
  try {
    await db
      .update(areas)
      .set({
        isArchived: archive ? "true" : "false",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(areas.id, id));

    updateTag("areas");
    updateTag(`area-${id}`);
    return { success: true };
  } catch (error) {
    console.error("Error archiving area:", error);
    return { success: false, error: "Failed to archive area" };
  }
}

export async function exportAreaGeoJSONAction(
  areaId: number
): ServerActionResponse<string> {
  try {
    const { rows } = await db.execute<{
      layer_id: number;
      layer_name: string;
      layer_color: string;
      layer_order: number;
      geometry: string | null;
      postal_codes: string[];
    }>(sql`
      SELECT
        al.id AS layer_id,
        al.name AS layer_name,
        al.color AS layer_color,
        al.order_index AS layer_order,
        ST_AsGeoJSON(ST_Union(pc.geometry))::text AS geometry,
        array_agg(alpc.postal_code ORDER BY alpc.postal_code) AS postal_codes
      FROM area_layers al
      LEFT JOIN area_layer_postal_codes alpc ON alpc.layer_id = al.id
      LEFT JOIN postal_codes pc ON pc.code = alpc.postal_code AND pc.granularity = al.granularity
      WHERE al.area_id = ${areaId}
      GROUP BY al.id, al.name, al.color, al.order_index
      ORDER BY al.order_index ASC
    `);

    const features = rows
      .filter((r) => r.geometry !== null)
      .map((r) => ({
        type: "Feature" as const,
        geometry: JSON.parse(r.geometry!),
        properties: {
          layerId: r.layer_id,
          name: r.layer_name,
          color: r.layer_color,
          order: r.layer_order,
          postalCodes: r.postal_codes ?? [],
          postalCodeCount: (r.postal_codes ?? []).length,
        },
      }));

    const geojson = {
      type: "FeatureCollection",
      features,
    };

    return { success: true, data: JSON.stringify(geojson, null, 2) };
  } catch (error) {
    console.error("Error exporting GeoJSON:", error);
    return { success: false, error: "GeoJSON Export fehlgeschlagen" };
  }
}


/** Area data format for JSON export/import (no geometry blobs, just PLZ codes). */
export interface AreaExportData {
  version: 1;
  name: string;
  description?: string | null;
  granularity: string;
  country: string;
  layers: Array<{
    name: string;
    color: string;
    opacity: number;
    isVisible: string;
    orderIndex: number;
    notes?: string | null;
    postalCodes: string[];
  }>;
}

export async function exportAreaDataAction(
  areaId: number
): ServerActionResponse<string> {
  try {
    const area = await db.query.areas.findFirst({
      where: eq(areas.id, areaId),
      with: {
        layers: {
          orderBy: (l, { asc }) => [asc(l.orderIndex)],
          with: { postalCodes: true },
        },
      },
    });

    if (!area) return { success: false, error: "Gebiet nicht gefunden" };

    const exportData: AreaExportData = {
      version: 1,
      name: area.name,
      description: area.description,
      granularity: area.granularity ?? "5digit",
      country: area.country ?? "DE",
      layers: area.layers.map((l) => ({
        name: l.name,
        color: l.color,
        opacity: l.opacity ?? 80,
        isVisible: l.isVisible ?? "true",
        orderIndex: l.orderIndex ?? 0,
        notes: l.notes,
        postalCodes: l.postalCodes.map((pc) => pc.postalCode).sort(),
      })),
    };

    return { success: true, data: JSON.stringify(exportData, null, 2) };
  } catch (error) {
    console.error("Error exporting area data:", error);
    return { success: false, error: "Daten-Export fehlgeschlagen" };
  }
}

export async function importAreaFromDataAction(
  jsonData: string,
  createdBy?: string
): ServerActionResponse<{ areaId: number }> {
  let redirectPath: string | null = null;

  try {
    const raw = JSON.parse(jsonData) as AreaExportData;
    if (!raw || typeof raw !== "object" || raw.version !== 1) {
      return { success: false, error: "Ungültiges Dateiformat" };
    }

    let newAreaId: number | null = null;

    await db.transaction(async (tx) => {
      const [newArea] = await tx
        .insert(areas)
        .values({
          name: raw.name,
          description: raw.description ?? undefined,
          granularity: raw.granularity ?? "5digit",
          country: raw.country ?? "DE",
        })
        .returning();

      newAreaId = newArea.id;

      for (const layerData of raw.layers) {
        const [newLayer] = await tx
          .insert(areaLayers)
          .values({
            areaId: newArea.id,
            name: layerData.name.slice(0, 31),
            color: layerData.color,
            opacity: layerData.opacity,
            isVisible: layerData.isVisible,
            orderIndex: layerData.orderIndex,
            notes: layerData.notes ?? null,
          })
          .returning();

        if (layerData.postalCodes.length > 0) {
          await tx
            .insert(areaLayerPostalCodes)
            .values(
              layerData.postalCodes.map((code) => ({
                layerId: newLayer.id,
                postalCode: code,
              }))
            )
            .onConflictDoNothing();
        }
      }
    });

    if (!newAreaId) throw new Error("Area creation failed");

    updateTag("areas");
    updateTag(`area-${newAreaId}`);
    updateTag("version-info");

    redirectPath = `/postal-codes/${newAreaId}`;
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("Error importing area data:", error);
    return { success: false, error: "Import fehlgeschlagen" };
  }

  if (redirectPath) redirect(redirectPath as Route);
  return { success: false, error: "Unbekannter Fehler" };
}

export async function duplicateAreaAction(sourceAreaId: number) {
  let redirectPath: string | null = null;

  try {
    await db.transaction(async (tx) => {
      // 1. Read source area
      const [sourceArea] = await tx
        .select()
        .from(areas)
        .where(eq(areas.id, sourceAreaId));

      if (!sourceArea) {
        throw new Error("Gebiet nicht gefunden");
      }

      // 2. Create new area
      const [newArea] = await tx
        .insert(areas)
        .values({
          name: `${sourceArea.name} (Kopie)`,
          description: sourceArea.description,
          granularity: sourceArea.granularity,
          country: sourceArea.country,
        })
        .returning();

      // 3. Read source layers with postal codes
      const sourceLayers = await tx
        .select()
        .from(areaLayers)
        .where(eq(areaLayers.areaId, sourceAreaId))
        .orderBy(areaLayers.orderIndex);

      // 4. Copy each layer and its postal codes
      for (const layer of sourceLayers) {
        const [newLayer] = await tx
          .insert(areaLayers)
          .values({
            areaId: newArea.id,
            name: layer.name,
            color: layer.color,
            opacity: layer.opacity,
            isVisible: layer.isVisible,
            orderIndex: layer.orderIndex,
          })
          .returning();

        const codes = await tx
          .select({ postalCode: areaLayerPostalCodes.postalCode })
          .from(areaLayerPostalCodes)
          .where(eq(areaLayerPostalCodes.layerId, layer.id));

        if (codes.length > 0) {
          await tx.insert(areaLayerPostalCodes).values(
            codes.map((c) => ({
              layerId: newLayer.id,
              postalCode: c.postalCode,
            }))
          );
        }
      }

      // 5. Create initial version
      const { createVersionAction } = await import("./version-actions");
      await createVersionAction(newArea.id, {
        name: "Erstversion",
        description: `Dupliziert von "${sourceArea.name}"`,
      });

      updateTag("areas");
      updateTag(`area-${newArea.id}`);
      redirectPath = `/postal-codes/${newArea.id}`;
    });
  } catch (error) {
    console.error("Error duplicating area:", error);
    return { success: false, error: "Failed to duplicate area" };
  } finally {
    if (redirectPath) {
      redirect(redirectPath as Route);
    }
  }
}

// ===============================

// LAYER OPERATIONS

// ===============================

export async function createLayerAction(
  areaId: number,

  data: {
    name: string;

    color: string;

    opacity: number;

    isVisible: boolean;

    orderIndex: number;
  },

  createdBy?: string
): ServerActionResponse<{ id: number }> {
  try {
    const [layer] = await db

      .insert(areaLayers)

      .values({
        areaId,

        name: data.name,

        color: data.color,

        opacity: data.opacity,

        isVisible: data.isVisible ? "true" : "false",

        orderIndex: data.orderIndex,
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

          color: data.color,

          opacity: data.opacity,

          isVisible: data.isVisible ? "true" : "false",

          orderIndex: data.orderIndex,
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

    isVisible?: boolean;

    orderIndex?: number;

    notes?: string | null;

    postalCodes?: string[];
  },

  createdBy?: string
): ServerActionResponse {
  try {
    // Get previous state

    const previousLayer = await db.query.areaLayers.findFirst({
      where: eq(areaLayers.id, layerId),

      with: { postalCodes: true },
    });

    await db.transaction(async (tx) => {
      // Update layer properties

      if (
        data.name !== undefined ||
        data.color !== undefined ||
        data.opacity !== undefined ||
        data.isVisible !== undefined ||
        data.orderIndex !== undefined ||
        data.notes !== undefined
      ) {
        await tx

          .update(areaLayers)

          .set({
            ...(data.name !== undefined && { name: data.name }),

            ...(data.color !== undefined && { color: data.color }),

            ...(data.opacity !== undefined && { opacity: data.opacity }),

            ...(data.isVisible !== undefined && {
              isVisible: data.isVisible ? "true" : "false",
            }),

            ...(data.orderIndex !== undefined && {
              orderIndex: data.orderIndex,
            }),

            ...(data.notes !== undefined && { notes: data.notes }),
          })

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
            data.postalCodes.map((code) => ({
              layerId,

              postalCode: code,
            }))
          );
        }
      }
    });

    // Record change

    const changeData: Record<string | number | symbol, unknown> = {};

    const previousData: Record<string | number | symbol, unknown> = {};

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
      changeData.isVisible = data.isVisible ? "true" : "false";

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

export async function deleteLayerAction(
  areaId: number,

  layerId: number,

  createdBy?: string
): ServerActionResponse {
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
      // Delete postal codes first

      await tx

        .delete(areaLayerPostalCodes)

        .where(eq(areaLayerPostalCodes.layerId, layerId));

      // Delete layer

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

export async function duplicateLayerAction(
  areaId: number,
  layerId: number,
  createdBy?: string
): ServerActionResponse<{ id: number }> {
  try {
    const sourceLayer = await db.query.areaLayers.findFirst({
      where: eq(areaLayers.id, layerId),
      with: { postalCodes: true },
    });

    if (!sourceLayer) {
      return { success: false, error: "Layer not found" };
    }

    // Get max orderIndex for the area to place copy at end
    const [maxOrder] = await db
      .select({ max: sql<number>`coalesce(max(${areaLayers.orderIndex}), 0)` })
      .from(areaLayers)
      .where(eq(areaLayers.areaId, areaId));

    // Generate a contrasting color based on all sibling layers
    const siblingLayers = await db
      .select({ color: areaLayers.color })
      .from(areaLayers)
      .where(eq(areaLayers.areaId, areaId));
    const newColor = generateNextColor(siblingLayers.map((l) => l.color));

    const newLayerId = await db.transaction(async (tx) => {
      const [newLayer] = await tx
        .insert(areaLayers)
        .values({
          areaId,
          name: `${sourceLayer.name} (Kopie)`,
          color: newColor,
          opacity: sourceLayer.opacity,
          isVisible: sourceLayer.isVisible,
          orderIndex: (maxOrder?.max ?? 0) + 1,
        })
        .returning();

      const codes = sourceLayer.postalCodes ?? [];
      if (codes.length > 0) {
        await tx.insert(areaLayerPostalCodes).values(
          codes.map((c) => ({
            layerId: newLayer.id,
            postalCode: c.postalCode,
          }))
        );
      }

      await recordChangeWithTx(tx, areaId, {
        changeType: "create_layer",
        entityType: "layer",
        entityId: newLayer.id,
        changeData: {
          layer: {
            areaId,
            name: newLayer.name,
            color: newLayer.color,
            opacity: newLayer.opacity,
            isVisible: newLayer.isVisible,
            orderIndex: newLayer.orderIndex,
          },
        },
        createdBy,
      });

      return newLayer.id;
    });

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-undo-redo`);

    return { success: true, data: { id: newLayerId } };
  } catch (error) {
    console.error("Error duplicating layer:", error);
    return { success: false, error: "Failed to duplicate layer" };
  }
}

export async function addPostalCodesToLayerAction(
  areaId: number,

  layerId: number,

  postalCodes: string[],

  createdBy?: string
): ServerActionResponse {
  try {
    if (!areaId || !layerId || !postalCodes || postalCodes.length === 0) {
      return { success: false, error: "Invalid parameters" };
    }

    // One atomic transaction: verify layer, insert codes, record change
    const newCodes = await db.transaction(async (tx) => {
      const layer = await tx.query.areaLayers.findFirst({
        where: and(eq(areaLayers.id, layerId), eq(areaLayers.areaId, areaId)),
      });

      if (!layer) {
        return null;
      }

      // Unique constraint handles dedup; RETURNING gives only what was inserted
      const insertedRows = await tx
        .insert(areaLayerPostalCodes)
        .values(postalCodes.map((code) => ({ layerId, postalCode: code })))
        .onConflictDoNothing()
        .returning({ postalCode: areaLayerPostalCodes.postalCode });

      const inserted = insertedRows.map((r) => r.postalCode);
      if (inserted.length === 0) {
        return inserted;
      }

      const changeKey = await recordChangeWithTx(tx, areaId, {
        changeType: "add_postal_codes",
        entityType: "postal_code",
        entityId: layerId,
        changeData: { postalCodes: inserted, layerId },
        previousData: {},
        createdBy,
      });

      if (!changeKey) {
        throw new Error("Area not found or no active version");
      }

      return inserted;
    });

    if (newCodes === null) {
      return {
        success: false,
        error: "Layer not found or does not belong to area",
      };
    }

    if (newCodes.length === 0) {
      return { success: true };
    }

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}-undo-redo`);
    updateTag(`area-${areaId}-change-history`);

    return { success: true };
  } catch (error) {
    console.error("Error adding postal codes to layer:", error);

    return { success: false, error: "Failed to add postal codes to layer" };
  }
}

export async function removePostalCodesFromLayerAction(
  areaId: number,

  layerId: number,

  postalCodes: string[],

  createdBy?: string
): ServerActionResponse {
  try {
    if (!areaId || !layerId || !postalCodes || postalCodes.length === 0) {
      return { success: false, error: "Invalid parameters" };
    }

    // One atomic transaction: verify layer, delete codes, record change
    const removedCodes = await db.transaction(async (tx) => {
      const layer = await tx.query.areaLayers.findFirst({
        where: and(eq(areaLayers.id, layerId), eq(areaLayers.areaId, areaId)),
      });

      if (!layer) {
        return null;
      }

      // RETURNING gives only what was actually deleted
      const deletedRows = await tx
        .delete(areaLayerPostalCodes)
        .where(
          and(
            eq(areaLayerPostalCodes.layerId, layerId),
            inArray(areaLayerPostalCodes.postalCode, postalCodes)
          )
        )
        .returning({ postalCode: areaLayerPostalCodes.postalCode });

      const deleted = deletedRows.map((r) => r.postalCode);
      if (deleted.length === 0) {
        return deleted;
      }

      const changeKey = await recordChangeWithTx(tx, areaId, {
        changeType: "remove_postal_codes",
        entityType: "postal_code",
        entityId: layerId,
        changeData: { postalCodes: deleted, layerId },
        previousData: { postalCodes: deleted },
        createdBy,
      });

      if (!changeKey) {
        throw new Error("Area not found or no active version");
      }

      return deleted;
    });

    if (removedCodes === null) {
      return {
        success: false,
        error: "Layer not found or does not belong to area",
      };
    }

    if (removedCodes.length === 0) {
      return { success: true };
    }

    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}-undo-redo`);
    updateTag(`area-${areaId}-change-history`);

    return { success: true };
  } catch (error) {
    console.error("Error removing postal codes from layer:", error);

    return {
      success: false,
      error: "Failed to remove postal codes from layer",
    };
  }
}

// ===============================

// GEOPROCESSING OPERATIONS

// ===============================

export async function geoprocessAction(data: {
  mode: "all" | "holes" | "expand";

  granularity: string;

  selectedCodes: string[];

  country?: string;
}): ServerActionResponse<{ resultCodes: string[] }> {
  try {
    const { mode, granularity, selectedCodes, country } = data;
    const countryFilter = country ? sql` AND country = ${country}` : sql``;

    if (!mode || !granularity || !Array.isArray(selectedCodes)) {
      return { success: false, error: "Missing required parameters" };
    }

    // Build SQL for geoprocessing

    let resultCodes: string[] = [];

    if (mode === "expand") {
      // Find unselected regions adjacent to selected

      let expandRows = [];

      if (selectedCodes.length > 0) {
        const { rows } = await db.execute(
          sql`SELECT code FROM postal_codes WHERE granularity = ${granularity}${countryFilter} AND code NOT IN (${sql.raw(
            selectedCodes.map(String).join(",")
          )}) AND ST_Touches(geometry, (SELECT ST_Union(geometry) AS geom FROM postal_codes WHERE granularity = ${granularity}${countryFilter} AND code IN (${sql.raw(
            selectedCodes.map(String).join(",")
          )})))`
        );

        expandRows = rows;
      } else {
        const { rows } = await db.execute(
          sql`SELECT code FROM postal_codes WHERE granularity = ${granularity}${countryFilter}`
        );

        expandRows = rows;
      }

      resultCodes = expandRows.map((r) =>
        String((r as Record<string, unknown>)["code"])
      );
    } else if (mode === "holes") {
      // Use a CTE for the convex hull to avoid recomputation and maximize performance

      if (selectedCodes.length > 0) {
        // Always treat codes as strings for SQL

        const codeList = selectedCodes

          .map((code) => `'${String(code)}'`)

          .join(",");

        const { rows } = await db.execute(
          sql`WITH hull AS (
            SELECT ST_ConvexHull(ST_Collect(geometry)) AS geom
            FROM postal_codes
            WHERE granularity = ${granularity}${countryFilter} AND code IN (${sql.raw(
              codeList
            )})
            )
            SELECT code FROM postal_codes, hull
            WHERE granularity = ${granularity}${countryFilter}
              AND code NOT IN (${sql.raw(codeList)})
              AND ST_Within(geometry, hull.geom)`
        );

        resultCodes = rows.map((r: Record<string, unknown>) => String(r.code));
      } else {
        resultCodes = [];
      }
    } else if (mode === "all") {
      // Find all unselected regions that intersect the selected union

      let gapRows = [];

      if (selectedCodes.length > 0) {
        const { rows } = await db.execute(
          sql`SELECT code FROM postal_codes WHERE granularity = ${granularity}${countryFilter} AND code NOT IN (${sql.raw(
            selectedCodes.map(String).join(",")
          )}) AND ST_Intersects(geometry, (SELECT ST_Union(geometry) AS geom FROM postal_codes WHERE granularity = ${granularity}${countryFilter} AND code IN (${sql.raw(
            selectedCodes.map(String).join(",")
          )})))`
        );

        gapRows = rows;
      } else {
        const { rows } = await db.execute(
          sql`SELECT code FROM postal_codes WHERE granularity = ${granularity}${countryFilter}`
        );

        gapRows = rows;
      }

      resultCodes = gapRows.map((r) =>
        String((r as Record<string, unknown>)["code"])
      );
    }

    return { success: true, data: { resultCodes } };
  } catch (error) {
    console.error("Error in geoprocessing:", error);

    return { success: false, error: "Geoprocessing failed" };
  }
}

// ===============================

// SEARCH OPERATIONS

// ===============================

export async function radiusSearchAction(data: {
  latitude: number;

  longitude: number;

  radius: number;

  granularity: string;
}): ServerActionResponse<{ postalCodes: string[] }> {
  try {
    const { latitude, longitude, radius, granularity } = data;

    // Convert radius from kilometers to meters for PostGIS

    const radiusMeters = radius * 1000;

    // Use ST_DWithin to find postal codes within the specified radius

    const { rows } = await db.execute(
      sql`
        SELECT code
        FROM postal_codes
        WHERE granularity = ${granularity}
        AND ST_DWithin(
          ST_Transform(geometry, 3857),
          ST_Transform(ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), 3857),
          ${radiusMeters}
        )
        ORDER BY ST_Distance(
          ST_Transform(geometry, 3857),
          ST_Transform(ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), 3857)
        )
      `
    );

    const postalCodes = rows.map((row) =>
      String((row as { code: string }).code)
    );

    return { success: true, data: { postalCodes } };
  } catch (error) {
    console.error("Error in radius search:", error);

    return { success: false, error: "Radius search failed" };
  }
}

export async function drivingRadiusSearchAction(data: {
  latitude: number;

  longitude: number;

  maxDuration: number;

  granularity: string;
}): ServerActionResponse<{ postalCodes: string[] }> {
  try {
    const { latitude, longitude, maxDuration, granularity } = data;

    // For simplicity, we'll use a basic approximation method

    // In a full implementation, you'd want to integrate the OSRM logic here

    const radiusKm = (maxDuration / 60) * 50; // Rough approximation: 50 km/h average speed

    // Get postal codes within the approximated radius

    const { rows } = await db.execute(
      sql`
        SELECT code
        FROM postal_codes
        WHERE granularity = ${granularity}
        AND ST_DWithin(
          ST_Transform(geometry, 3857),
          ST_Transform(ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), 3857),
          ${radiusKm * 1000}
        )
        ORDER BY ST_Distance(
          ST_Transform(geometry, 3857),
          ST_Transform(ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326), 3857)
        )
      `
    );

    const postalCodes = rows.map((row) =>
      String((row as { code: string }).code)
    );

    return { success: true, data: { postalCodes } };
  } catch (error) {
    console.error("Error in driving radius search:", error);

    return { success: false, error: "Driving radius search failed" };
  }
}

export async function geocodeSearchAction(data: {
  query: string;

  includePostalCode?: boolean;

  limit?: number;

  enhancedSearch?: boolean;
}): ServerActionResponse<{
  results: {
    id: number | string;

    display_name: string;

    coordinates: [number, number];

    postal_code?: string;

    city?: string;

    state?: string;

    country?: string;
  }[];

  searchInfo: {
    originalQuery: string;

    variantsUsed: string[];

    totalResults: number;

    uniqueResults: number;
  };
}> {
  try {
    const {
      query,

      includePostalCode = true,

      limit = 5,
    } = data;

    // For now, use simple Nominatim search

    // Implement enhanced search with multiple variants

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(
      {
        format: "json",

        q: query,

        addressdetails: "1",

        limit: limit.toString(),

        countrycodes: "de,at,ch",

        "accept-language": "de,en",
      }
    )}`;

    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "KRAUSS Territory Management/1.0",
      },
    });

    if (!response.ok) {
      throw new Error("Geocoding service unavailable");
    }

    const nominatimResults = await response.json();

    const results = nominatimResults.map((result: Result) => ({
      id: result.place_id,

      display_name: result.display_name,

      coordinates: [parseFloat(result.lon), parseFloat(result.lat)] as [
        number,

        number,
      ],

      postal_code: result.address?.postcode,

      city:
        result.address?.city || result.address?.town || result.address?.village,

      state: result.address?.state,

      country: result.address?.country,
    }));

    // Filter results if postal code is required

    const filteredResults = includePostalCode
      ? results.filter((result: { postal_code: string }) => result.postal_code)
      : results;

    return {
      success: true,

      data: {
        results: filteredResults,

        searchInfo: {
          originalQuery: query,

          variantsUsed: [query], // implement variants

          totalResults: results.length,

          uniqueResults: filteredResults.length,
        },
      },
    };
  } catch (error) {
    console.error("Error in geocoding search:", error);

    return { success: false, error: "Geocoding search failed" };
  }
}

export async function searchPostalCodesByBoundaryAction(data: {
  areaName: string;

  granularity: string;

  limit?: number;
}): ServerActionResponse<{
  postalCodes: string[];

  count: number;

  granularity: string;

  areaInfo: {
    name: string;

    boundingbox: [string, string, string, string];
  };

  searchInfo: {
    originalQuery: string;

    variantsUsed: string[];

    boundaryFound: boolean;

    geometryType?: string;
  };
}> {
  try {
    const { areaName, granularity, limit = 3000 } = data;

    // Get search variants (simplified)

    const searchVariants = [areaName];

    // Try to get boundary from Nominatim

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?${new URLSearchParams(
      {
        format: "geojson",

        q: areaName,

        polygon_geojson: "1",

        addressdetails: "1",

        limit: "5",

        countrycodes: "de,at,ch",

        "accept-language": "de,en",
      }
    )}`;

    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "KRAUSS Territory Management/1.0",
      },
    });

    if (!response.ok) {
      return {
        success: false,

        data: {
          postalCodes: [],

          count: 0,

          granularity,

          areaInfo: {
            name: areaName,

            boundingbox: ["0", "0", "0", "0"],
          },

          searchInfo: {
            originalQuery: areaName,

            variantsUsed: searchVariants,

            boundaryFound: false,
          },
        },
      };
    }

    const geoJsonData = await response.json();

    if (!geoJsonData.features || geoJsonData.features.length === 0) {
      return {
        success: false,

        data: {
          postalCodes: [],

          count: 0,

          granularity,

          areaInfo: {
            name: areaName,

            boundingbox: ["0", "0", "0", "0"],
          },

          searchInfo: {
            originalQuery: areaName,

            variantsUsed: searchVariants,

            boundaryFound: false,
          },
        },
      };
    }

    const feature = geoJsonData.features[0];

    if (
      !feature.geometry ||
      (feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon")
    ) {
      return {
        success: false,

        data: {
          postalCodes: [],

          count: 0,

          granularity,

          areaInfo: {
            name: areaName,

            boundingbox: ["0", "0", "0", "0"],
          },

          searchInfo: {
            originalQuery: areaName,

            variantsUsed: searchVariants,

            boundaryFound: false,
          },
        },
      };
    }

    const boundaryGeometry = JSON.stringify(feature.geometry);

    const areaInfo = {
      display_name: feature.properties.display_name,

      boundingbox: [
        feature.bbox[1].toString(), // south

        feature.bbox[3].toString(), // north

        feature.bbox[0].toString(), // west

        feature.bbox[2].toString(), // east
      ],
    };

    // Find postal codes within boundary

    const intersectingCodes = await db

      .select({
        code: postalCodes.code,
      })

      .from(postalCodes)

      .where(
        sql`${postalCodes.granularity} = ${granularity}
          AND ST_Contains(
            ST_GeomFromGeoJSON(${boundaryGeometry}),
            ST_Centroid(${postalCodes.geometry})
          )`
      )

      .limit(limit);

    const codes = intersectingCodes.map((row) => row.code).sort();

    return {
      success: true,

      data: {
        postalCodes: codes,

        count: codes.length,

        granularity,

        areaInfo: {
          name: areaInfo.display_name,

          boundingbox: areaInfo.boundingbox as [string, string, string, string],
        },

        searchInfo: {
          originalQuery: areaName,

          variantsUsed: searchVariants,

          boundaryFound: true,

          geometryType: feature.geometry.type,
        },
      },
    };
  } catch (error) {
    console.error("Error in boundary search:", error);

    return { success: false, error: "Boundary search failed" };
  }
}

export interface PlzSearchResult {
  areaId: number;
  areaName: string;
  layerId: number;
  layerName: string;
  layerColor: string;
  country: string;
  granularity: string;
}

export async function searchPostalCodeInAreasAction(
  postalCode: string
): ServerActionResponse<PlzSearchResult[]> {
  const code = postalCode.trim().toUpperCase();
  if (!code) return { success: true, data: [] };
  try {
    const { rows } = await db.execute<Record<string, unknown>>(sql`
      SELECT
        a.id AS "areaId",
        a.name AS "areaName",
        al.id AS "layerId",
        al.name AS "layerName",
        al.color AS "layerColor",
        a.country AS country,
        a.granularity AS granularity
      FROM area_layer_postal_codes alpc
      INNER JOIN area_layers al ON al.id = alpc.layer_id
      INNER JOIN areas a ON a.id = al.area_id
      WHERE alpc.postal_code = ${code}
        AND a.is_archived != 'true'
      ORDER BY a.name, al.order_index
    `);
    return { success: true, data: rows as unknown as PlzSearchResult[] };
  } catch (error) {
    console.error("Error searching PLZ:", error);
    return { success: false, error: "PLZ-Suche fehlgeschlagen" };
  }
}

// ---------------------------------------------------------------------------
// Layer Template Actions
// ---------------------------------------------------------------------------

/** Save the layer structure of an area as a named template */
export async function saveLayerTemplateAction(
  areaId: number,
  name: string,
  description?: string
): ServerActionResponse<{ id: number }> {
  try {
    const layers = await db.query.areaLayers.findMany({
      where: eq(areaLayers.areaId, areaId),
      orderBy: areaLayers.orderIndex,
    });
    if (layers.length === 0) {
      return { success: false, error: "Gebiet hat keine Ebenen" };
    }
    const templateLayers = layers.map((l) => ({
      name: l.name,
      color: l.color,
      opacity: Number(l.opacity ?? 0.7),
      orderIndex: l.orderIndex,
      notes: l.notes ?? null,
    }));
    const [template] = await db
      .insert(layerTemplates)
      .values({ name: name.trim(), description: description?.trim() ?? null, layers: templateLayers })
      .returning();
    return { success: true, data: { id: template.id } };
  } catch (error) {
    console.error("Error saving layer template:", error);
    return { success: false, error: "Vorlage konnte nicht gespeichert werden" };
  }
}

/** Get all layer templates */
export async function getLayerTemplatesAction(): ServerActionResponse<SelectLayerTemplates[]> {
  try {
    const templates = await db.query.layerTemplates.findMany({
      orderBy: layerTemplates.createdAt,
    });
    return { success: true, data: templates };
  } catch (error) {
    console.error("Error fetching layer templates:", error);
    return { success: false, error: "Vorlagen konnten nicht geladen werden" };
  }
}

/** Delete a layer template */
export async function deleteLayerTemplateAction(
  templateId: number
): ServerActionResponse {
  try {
    await db.delete(layerTemplates).where(eq(layerTemplates.id, templateId));
    return { success: true };
  } catch (error) {
    console.error("Error deleting layer template:", error);
    return { success: false, error: "Vorlage konnte nicht gelöscht werden" };
  }
}

/**
 * Apply a template to an area: replaces existing layers (preserving postal codes by matching name)
 * with the template's layer structure.
 */
export async function applyLayerTemplateAction(
  templateId: number,
  areaId: number
): ServerActionResponse {
  try {
    const template = await db.query.layerTemplates.findFirst({
      where: eq(layerTemplates.id, templateId),
    });
    if (!template) return { success: false, error: "Vorlage nicht gefunden" };

    await db.transaction(async (tx) => {
      // Fetch existing layers to preserve postal codes by name match
      const existingLayers = await tx.query.areaLayers.findMany({
        where: eq(areaLayers.areaId, areaId),
        with: { postalCodes: { columns: { postalCode: true } } },
      });
      const existingByName = new Map(existingLayers.map((l) => [l.name.toLowerCase(), l]));

      // Remove all existing layers
      const existingIds = existingLayers.map((l) => l.id);
      if (existingIds.length > 0) {
        await tx.delete(areaLayerPostalCodes).where(inArray(areaLayerPostalCodes.layerId, existingIds));
        await tx.delete(areaLayers).where(eq(areaLayers.areaId, areaId));
      }

      // Insert template layers and re-attach postal codes where name matches
      const templateLayerDefs = template.layers as Array<{
        name: string;
        color: string;
        opacity: number;
        orderIndex: number;
        notes?: string | null;
      }>;

      for (const def of templateLayerDefs) {
        const [newLayer] = await tx
          .insert(areaLayers)
          .values({
            areaId,
            name: def.name,
            color: def.color,
            opacity: def.opacity,
            isVisible: "true",
            orderIndex: def.orderIndex,
            notes: def.notes ?? null,
          })
          .returning();

        const matched = existingByName.get(def.name.toLowerCase());
        if (matched && matched.postalCodes && matched.postalCodes.length > 0) {
          await tx.insert(areaLayerPostalCodes).values(
            matched.postalCodes.map((pc) => ({
              layerId: newLayer.id,
              postalCode: pc.postalCode,
            }))
          );
        }
      }
    });

    updateTag(`area-${areaId}-layers`);
    return { success: true };
  } catch (error) {
    console.error("Error applying layer template:", error);
    return { success: false, error: "Vorlage konnte nicht angewendet werden" };
  }
}

// ---------------------------------------------------------------------------
// Area Comparison
// ---------------------------------------------------------------------------

export interface AreaComparisonLayer {
  id: number;
  name: string;
  color: string;
  postalCodeCount: number;
  orderIndex: number;
}

export interface AreaComparisonData {
  id: number;
  name: string;
  country: string | null;
  granularity: string | null;
  layers: AreaComparisonLayer[];
  totalPlz: number;
}

export interface AreaComparisonResult {
  a: AreaComparisonData;
  b: AreaComparisonData;
  overlapCount: number;
  onlyInA: number;
  onlyInB: number;
}

export async function getAreaComparisonAction(
  areaIdA: number,
  areaIdB: number
): ServerActionResponse<AreaComparisonResult> {
  try {
    const [dataA, dataB, overlap] = await Promise.all([
      // Area A details
      db.execute<Record<string, unknown>>(sql`
        SELECT
          a.id, a.name, a.country, a.granularity,
          COALESCE(json_agg(
            json_build_object(
              'id', al.id,
              'name', al.name,
              'color', al.color,
              'orderIndex', al.order_index,
              'postalCodeCount', (
                SELECT COUNT(*) FROM area_layer_postal_codes alpc WHERE alpc.layer_id = al.id
              )
            ) ORDER BY al.order_index
          ) FILTER (WHERE al.id IS NOT NULL), '[]') AS layers,
          (SELECT COUNT(DISTINCT alpc.postal_code)
           FROM area_layer_postal_codes alpc
           INNER JOIN area_layers al2 ON al2.id = alpc.layer_id AND al2.area_id = a.id
          ) AS "totalPlz"
        FROM areas a
        LEFT JOIN area_layers al ON al.area_id = a.id
        WHERE a.id = ${areaIdA}
        GROUP BY a.id
      `),
      // Area B details
      db.execute<Record<string, unknown>>(sql`
        SELECT
          a.id, a.name, a.country, a.granularity,
          COALESCE(json_agg(
            json_build_object(
              'id', al.id,
              'name', al.name,
              'color', al.color,
              'orderIndex', al.order_index,
              'postalCodeCount', (
                SELECT COUNT(*) FROM area_layer_postal_codes alpc WHERE alpc.layer_id = al.id
              )
            ) ORDER BY al.order_index
          ) FILTER (WHERE al.id IS NOT NULL), '[]') AS layers,
          (SELECT COUNT(DISTINCT alpc.postal_code)
           FROM area_layer_postal_codes alpc
           INNER JOIN area_layers al2 ON al2.id = alpc.layer_id AND al2.area_id = a.id
          ) AS "totalPlz"
        FROM areas a
        LEFT JOIN area_layers al ON al.area_id = a.id
        WHERE a.id = ${areaIdB}
        GROUP BY a.id
      `),
      // Overlap count
      db.execute<Record<string, unknown>>(sql`
        SELECT COUNT(DISTINCT a_codes.postal_code) AS overlap
        FROM area_layer_postal_codes a_codes
        INNER JOIN area_layers al_a ON al_a.id = a_codes.layer_id AND al_a.area_id = ${areaIdA}
        WHERE EXISTS (
          SELECT 1 FROM area_layer_postal_codes b_codes
          INNER JOIN area_layers al_b ON al_b.id = b_codes.layer_id AND al_b.area_id = ${areaIdB}
          WHERE b_codes.postal_code = a_codes.postal_code
        )
      `),
    ]);

    if (!dataA.rows[0] || !dataB.rows[0]) {
      return { success: false, error: "Gebiet nicht gefunden" };
    }

    const rowA = dataA.rows[0] as Record<string, unknown>;
    const rowB = dataB.rows[0] as Record<string, unknown>;
    const overlapRow = overlap.rows[0] as Record<string, unknown>;
    const overlapCount = Number(overlapRow.overlap ?? 0);

    const aData: AreaComparisonData = {
      id: Number(rowA.id),
      name: String(rowA.name),
      country: rowA.country ? String(rowA.country) : null,
      granularity: rowA.granularity ? String(rowA.granularity) : null,
      layers: (rowA.layers as AreaComparisonLayer[]) ?? [],
      totalPlz: Number(rowA.totalPlz ?? 0),
    };
    const bData: AreaComparisonData = {
      id: Number(rowB.id),
      name: String(rowB.name),
      country: rowB.country ? String(rowB.country) : null,
      granularity: rowB.granularity ? String(rowB.granularity) : null,
      layers: (rowB.layers as AreaComparisonLayer[]) ?? [],
      totalPlz: Number(rowB.totalPlz ?? 0),
    };

    return {
      success: true,
      data: {
        a: aData,
        b: bData,
        overlapCount,
        onlyInA: aData.totalPlz - overlapCount,
        onlyInB: bData.totalPlz - overlapCount,
      },
    };
  } catch (error) {
    console.error("Error comparing areas:", error);
    return { success: false, error: "Vergleich fehlgeschlagen" };
  }
}

// ─── Area Tags Actions ────────────────────────────────────────────────────────

export interface AreaTagWithCount {
  id: number;
  name: string;
  color: string;
  createdAt: string;
  areaCount: number;
}

export async function getAllTagsAction(): ServerActionResponse<AreaTagWithCount[]> {
  try {
    const rows = await db
      .select({
        id: areaTags.id,
        name: areaTags.name,
        color: areaTags.color,
        createdAt: areaTags.createdAt,
        areaCount: sql<number>`count(${areaTagAssignments.areaId})::int`,
      })
      .from(areaTags)
      .leftJoin(areaTagAssignments, eq(areaTags.id, areaTagAssignments.tagId))
      .groupBy(areaTags.id)
      .orderBy(areaTags.name);

    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getAreaTagsAction(areaId: number): ServerActionResponse<{ id: number; name: string; color: string }[]> {
  try {
    const rows = await db
      .select({ id: areaTags.id, name: areaTags.name, color: areaTags.color })
      .from(areaTags)
      .innerJoin(areaTagAssignments, eq(areaTags.id, areaTagAssignments.tagId))
      .where(eq(areaTagAssignments.areaId, areaId))
      .orderBy(areaTags.name);

    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function createTagAction(name: string, color: string): ServerActionResponse<{ id: number; name: string; color: string }> {
  try {
    const [tag] = await db
      .insert(areaTags)
      .values({ name: name.trim().slice(0, 50), color })
      .returning({ id: areaTags.id, name: areaTags.name, color: areaTags.color });

    updateTag("tags");
    return { success: true, data: tag };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function deleteTagAction(tagId: number): ServerActionResponse<void> {
  try {
    await db.delete(areaTags).where(eq(areaTags.id, tagId));
    updateTag("tags");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function assignTagToAreaAction(areaId: number, tagId: number): ServerActionResponse<void> {
  try {
    await db
      .insert(areaTagAssignments)
      .values({ areaId, tagId })
      .onConflictDoNothing();

    updateTag(`area-${areaId}-tags`);
    updateTag("tags");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function removeTagFromAreaAction(areaId: number, tagId: number): ServerActionResponse<void> {
  try {
    await db
      .delete(areaTagAssignments)
      .where(and(eq(areaTagAssignments.areaId, areaId), eq(areaTagAssignments.tagId, tagId)));

    updateTag(`area-${areaId}-tags`);
    updateTag("tags");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
