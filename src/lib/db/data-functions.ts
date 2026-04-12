import "server-only";
// Database functions for data loading - to be used directly in server components
// These replace the server actions for GET operations
import { eq, and, desc, like } from "drizzle-orm";
import { cacheTag, cacheLife } from "next/cache";

import { db } from "../db";
import {
  areas,
  areaLayers,
  areaVersions,
  areaChanges,
  areaUndoStacks,
  postalCodes,
} from "../schema/schema";

export async function getAreas() {
  "use cache";
  cacheLife("minutes");
  cacheTag("areas");
  try {
    const result = await db.query.areas.findMany({
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

export async function getAreaById(id: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag("areas", `area-${id}`);
  try {
    const area = await db.query.areas.findFirst({
      where: eq(areas.id, id),
      with: {
        layers: {
          with: {
            postalCodes: true,
          },
          orderBy: (layers, { asc }) => [asc(layers.orderIndex)],
        },
      },
    });

    if (!area) {
      throw new Error("Area not found");
    }

    return area;
  } catch (error) {
    console.error("Error fetching area:", error);
    throw new Error("Failed to fetch area", { cause: error });
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
        postalCodes: true,
      },
      orderBy: (layers, { asc }) => [asc(layers.orderIndex)],
    });

    return result;
  } catch (error) {
    console.error("Error fetching layers:", error);
    throw new Error("Failed to fetch layers", { cause: error });
  }
}

// Version-related functions
export async function getVersions(areaId: number) {
  "use cache";
  cacheLife("minutes");
  cacheTag("versions", `area-${areaId}-versions`);
  try {
    const versions = await db.query.areaVersions.findMany({
      where: eq(areaVersions.areaId, areaId),
      orderBy: (versions, { desc }) => [desc(versions.versionNumber)],
    });
    return versions;
  } catch (error) {
    console.error("Error fetching versions:", error);
    throw new Error("Failed to fetch versions", { cause: error });
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
    const versions = await db.query.areaVersions.findMany({
      where: eq(areaVersions.areaId, areaId),
      orderBy: (versions, { desc }) => [desc(versions.versionNumber)],
    });

    const hasVersions = versions.length > 0;

    let versionInfo = null;

    if (versionId) {
      // Specific version is selected - for now, assume it's the latest if versionId is provided
      // This needs to be updated when we have a way to identify specific versions
      if (versionId && versions.length > 0) {
        const version =
          versions.find((v) => v.versionNumber === versionId) || versions[0];
        versionInfo = {
          versionNumber: version.versionNumber,
          name: version.name,
          isLatest: version.versionNumber === versions[0].versionNumber,
        };
      }
    } else if (versions.length > 0) {
      // No specific version, but versions exist - showing latest
      const latestVersion = versions[0];
      versionInfo = {
        versionNumber: latestVersion.versionNumber,
        name: latestVersion.name,
        isLatest: true,
      };
    }

    return {
      hasVersions,
      versionInfo,
    };
  } catch (error) {
    console.error("Error fetching version indicator info:", error);
    throw new Error("Failed to fetch version info", { cause: error });
  }
}

// Change history functions
export async function getChangeHistory(
  areaId: number,
  options?: {
    versionId?: number;
    limit?: number;
    includeUndone?: boolean;
  }
) {
  "use cache";
  cacheLife("seconds");
  cacheTag("change-history", `area-${areaId}-change-history`);
  try {
    let whereConditions = eq(areaChanges.areaId, areaId);

    if (options?.versionId) {
      // For now, we'll need to get the version first to get the composite key
      // This is a limitation of the current design - we might need to change this later
      const version = await db.query.areaVersions.findFirst({
        where: and(
          eq(areaVersions.areaId, areaId),
          eq(areaVersions.versionNumber, options.versionId)
        ),
      });
      if (version) {
        whereConditions = and(
          whereConditions,
          eq(areaChanges.versionAreaId, version.areaId),
          eq(areaChanges.versionNumber, version.versionNumber)
        )!;
      }
    }

    if (!options?.includeUndone) {
      whereConditions = and(
        whereConditions,
        eq(areaChanges.isUndone, "false")
      )!;
    }

    let query = db
      .select()
      .from(areaChanges)
      .where(whereConditions)
      .orderBy(desc(areaChanges.sequenceNumber));

    if (options?.limit) {
      query = query.limit(options.limit) as unknown as typeof query;
    }

    const changes = await query;
    return changes;
  } catch (error) {
    console.error("Error fetching change history:", error);
    throw new Error("Failed to fetch change history", { cause: error });
  }
}

// Undo/redo status function
export async function getUndoRedoStatus(areaId: number) {
  "use cache";
  cacheLife("seconds");
  cacheTag(`area-${areaId}-undo-redo`);
  try {
    const stack = await db.query.areaUndoStacks.findFirst({
      where: eq(areaUndoStacks.areaId, areaId),
    });

    if (!stack) {
      return { canUndo: false, canRedo: false, undoCount: 0, redoCount: 0 };
    }

    const undoStack = (stack.undoStack as unknown[]) || [];
    const redoStack = (stack.redoStack as unknown[]) || [];

    return {
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      undoCount: undoStack.length,
      redoCount: redoStack.length,
    };
  } catch (error) {
    console.error("Error getting undo/redo status:", error);
    throw new Error("Failed to get undo/redo status", { cause: error });
  }
}

// Granularity-related functions
export async function getMatchingPostalCodes(
  prefix: string,
  targetGranularity: string
) {
  "use cache";
  cacheLife("days");
  cacheTag("postal-codes", `postal-codes-${targetGranularity}-${prefix}`);
  try {
    const matchingCodes = await db
      .select({ code: postalCodes.code })
      .from(postalCodes)
      .where(
        and(
          eq(postalCodes.granularity, targetGranularity),
          like(postalCodes.code, `${prefix}%`)
        )
      );

    return matchingCodes.map((mc) => mc.code);
  } catch (error) {
    console.error("Error fetching matching postal codes:", error);
    throw new Error("Failed to fetch matching postal codes", { cause: error });
  }
}
