import "server-only";
// Database functions for data loading - to be used directly in server components
// These replace the server actions for GET operations
import { eq, and, desc, sql } from "drizzle-orm";
import { cacheTag, cacheLife } from "next/cache";

import { db } from "../db";
import {
  areas,
  areaLayers,
  areaVersions,
  areaChanges,
  areaUndoStacks,
} from "../schema/schema";

export async function getAreas() {
  "use cache";
  cacheLife("minutes");
  cacheTag("areas");
  try {
    const result = await db.query.areas.findMany({
      columns: {
        id: true,
        name: true,
        granularity: true,
        isArchived: true,
        updatedAt: true,
      },
      orderBy: (areas, { desc }) => [desc(areas.updatedAt)],
    });
    return result;
  } catch (error) {
    console.error("Error fetching areas:", error);
    throw new Error("Failed to fetch areas", { cause: error });
  }
}

/**
 * Lightweight fetch — only reads the granularity column.
 * Used by resolveGranularity in page.tsx to avoid loading the full
 * area + layers + postalCodes join just to get one scalar field.
 */
export async function getAreaGranularity(id: number): Promise<string | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("areas", `area-${id}`);
  try {
    const row = await db.query.areas.findFirst({
      where: eq(areas.id, id),
      columns: { granularity: true },
    });
    return row?.granularity ?? null;
  } catch (error) {
    console.error("Error fetching area granularity:", error);
    return null;
  }
}

/** Lightweight fetch — only reads the name column. */
export async function getAreaName(id: number): Promise<string | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("areas", `area-${id}`);
  try {
    const row = await db.query.areas.findFirst({
      where: eq(areas.id, id),
      columns: { name: true },
    });
    return row?.name ?? null;
  } catch (error) {
    console.error("Error fetching area name:", error);
    return null;
  }
}

export async function getLayers(areaId: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`area-${areaId}-layers`);
  try {
    const result = await db.query.areaLayers.findMany({
      where: eq(areaLayers.areaId, areaId),
      with: {
        postalCodes: { columns: { postalCode: true } },
      },
      orderBy: (layers, { asc }) => [asc(layers.orderIndex)],
    });

    return result;
  } catch (error) {
    console.error("Error fetching layers:", error);
    throw new Error("Failed to fetch layers", { cause: error });
  }
}

/** Lightweight version list — excludes the heavy snapshot JSONB, adds computed layerCount */
export async function getVersionSummaries(areaId: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag("versions", `area-${areaId}-versions`);
  try {
    const versions = await db
      .select({
        areaId: areaVersions.areaId,
        versionNumber: areaVersions.versionNumber,
        name: areaVersions.name,
        description: areaVersions.description,
        isActive: areaVersions.isActive,
        changeCount: areaVersions.changeCount,
        branchName: areaVersions.branchName,
        createdBy: areaVersions.createdBy,
        createdAt: areaVersions.createdAt,
        layerCount: sql<number>`coalesce(jsonb_array_length(${areaVersions.snapshot}->'layers'), 0)`,
      })
      .from(areaVersions)
      .where(eq(areaVersions.areaId, areaId))
      .orderBy(desc(areaVersions.versionNumber));
    return versions;
  } catch (error) {
    console.error("Error fetching version summaries:", error);
    throw new Error("Failed to fetch version summaries", { cause: error });
  }
}

export async function getVersion(areaId: number, versionNumber: number) {
  "use cache";
  cacheLife("hours");
  cacheTag("version", `area-${areaId}-version-${versionNumber}`);
  try {
    const version = await db.query.areaVersions.findFirst({
      where: and(
        eq(areaVersions.areaId, areaId),
        eq(areaVersions.versionNumber, versionNumber)
      ),
    });

    if (!version) {
      throw new Error("Version not found");
    }

    return version;
  } catch (error) {
    console.error("Error fetching version:", error);
    throw new Error("Failed to fetch version", { cause: error });
  }
}

export async function getVersionIndicatorInfo(
  areaId: number,
  versionId?: number | null
) {
  "use cache";
  cacheLife("minutes");
  cacheTag("version-info", `area-${areaId}-version-info`);
  try {
    // Fetch only the latest version (lightweight — no snapshot)
    const latest = await db.query.areaVersions.findFirst({
      where: eq(areaVersions.areaId, areaId),
      columns: { versionNumber: true, name: true },
      orderBy: (v, { desc }) => [desc(v.versionNumber)],
    });

    const hasVersions = !!latest;
    let versionInfo = null;

    if (versionId && hasVersions) {
      if (versionId === latest.versionNumber) {
        versionInfo = {
          versionNumber: latest.versionNumber,
          name: latest.name,
          isLatest: true,
        };
      } else {
        // Fetch the specific version requested
        const selected = await db.query.areaVersions.findFirst({
          where: and(
            eq(areaVersions.areaId, areaId),
            eq(areaVersions.versionNumber, versionId)
          ),
          columns: { versionNumber: true, name: true },
        });
        versionInfo = selected
          ? {
              versionNumber: selected.versionNumber,
              name: selected.name,
              isLatest: false,
            }
          : {
              versionNumber: latest.versionNumber,
              name: latest.name,
              isLatest: true,
            };
      }
    } else if (hasVersions) {
      versionInfo = {
        versionNumber: latest.versionNumber,
        name: latest.name,
        isLatest: true,
      };
    }

    return { hasVersions, versionInfo };
  } catch (error) {
    console.error("Error fetching version indicator info:", error);
    throw new Error("Failed to fetch version info", { cause: error });
  }
}

// Lightweight change summaries — excludes heavy changeData/previousData JSONB
export async function getChangeSummaries(
  areaId: number,
  options?: {
    versionId?: number;
    limit?: number;
    includeUndone?: boolean;
  }
) {
  "use cache";
  cacheLife("seconds");
  cacheTag(`area-${areaId}-change-history`);
  try {
    const conditions = [eq(areaChanges.areaId, areaId)];

    if (options?.versionId) {
      const version = await db.query.areaVersions.findFirst({
        where: and(
          eq(areaVersions.areaId, areaId),
          eq(areaVersions.versionNumber, options.versionId)
        ),
        columns: { areaId: true, versionNumber: true },
      });
      if (version) {
        conditions.push(eq(areaChanges.versionAreaId, version.areaId));
        conditions.push(eq(areaChanges.versionNumber, version.versionNumber));
      }
    }

    if (!options?.includeUndone) {
      conditions.push(eq(areaChanges.isUndone, "false"));
    }

    let query = db
      .select({
        areaId: areaChanges.areaId,
        versionAreaId: areaChanges.versionAreaId,
        versionNumber: areaChanges.versionNumber,
        sequenceNumber: areaChanges.sequenceNumber,
        changeType: areaChanges.changeType,
        entityType: areaChanges.entityType,
        entityId: areaChanges.entityId,
        isUndone: areaChanges.isUndone,
        createdBy: areaChanges.createdBy,
        createdAt: areaChanges.createdAt,
        // Extract counts/names from JSONB via SQL instead of fetching full blobs
        postalCodeCount: sql<number>`coalesce(jsonb_array_length(${areaChanges.changeData}->'postalCodes'), 0)`,
        layerName: sql<
          string | null
        >`${areaChanges.changeData}->'layer'->>'name'`,
        previousLayerName: sql<
          string | null
        >`${areaChanges.previousData}->'layer'->>'name'`,
      })
      .from(areaChanges)
      .where(and(...conditions))
      .orderBy(desc(areaChanges.sequenceNumber));

    if (options?.limit) {
      query = query.limit(options.limit) as unknown as typeof query;
    }

    return await query;
  } catch (error) {
    console.error("Error fetching change summaries:", error);
    throw new Error("Failed to fetch change summaries", { cause: error });
  }
}

// Undo/redo status — uses jsonb_array_length instead of fetching full stacks
export async function getUndoRedoStatus(areaId: number) {
  "use cache";
  cacheLife("seconds");
  cacheTag(`area-${areaId}-undo-redo`);
  try {
    const result = await db
      .select({
        undoCount: sql<number>`coalesce(jsonb_array_length(${areaUndoStacks.undoStack}), 0)`,
        redoCount: sql<number>`coalesce(jsonb_array_length(${areaUndoStacks.redoStack}), 0)`,
      })
      .from(areaUndoStacks)
      .where(eq(areaUndoStacks.areaId, areaId))
      .limit(1);

    if (result.length === 0) {
      return { canUndo: false, canRedo: false, undoCount: 0, redoCount: 0 };
    }

    const { undoCount, redoCount } = result[0];
    return {
      canUndo: undoCount > 0,
      canRedo: redoCount > 0,
      undoCount,
      redoCount,
    };
  } catch (error) {
    console.error("Error getting undo/redo status:", error);
    throw new Error("Failed to get undo/redo status", { cause: error });
  }
}
