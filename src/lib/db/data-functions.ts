import "server-only";
// Database functions for data loading - to be used directly in server components
// These replace the server actions for GET operations
import { eq, and, desc, sql, inArray } from "drizzle-orm";
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
    const result = await db
      .select({
        id: areas.id,
        name: areas.name,
        granularity: areas.granularity,
        isArchived: areas.isArchived,
        updatedAt: areas.updatedAt,
        country: areas.country,
        description: areas.description,
        postalCodeCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM area_layer_postal_codes alpc
          INNER JOIN area_layers al ON al.id = alpc.layer_id
          WHERE al.area_id = "areas"."id"
        )`.as("postalCodeCount"),
        uniquePostalCodeCount: sql<number>`(
          SELECT COUNT(DISTINCT alpc.postal_code)::int
          FROM area_layer_postal_codes alpc
          INNER JOIN area_layers al ON al.id = alpc.layer_id
          WHERE al.area_id = "areas"."id"
        )`.as("uniquePostalCodeCount"),
        layerCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM area_layers al
          WHERE al.area_id = "areas"."id"
        )`.as("layerCount"),
        tags: sql<{ id: number; name: string; color: string }[]>`(
          SELECT coalesce(json_agg(json_build_object('id', at.id, 'name', at.name, 'color', at.color) ORDER BY at.name), '[]'::json)
          FROM area_tag_assignments ata
          INNER JOIN area_tags at ON at.id = ata.tag_id
          WHERE ata.area_id = "areas"."id"
        )`.as("tags"),
        conflictCount: sql<number>`(
          SELECT COUNT(DISTINCT own.postal_code)::int
          FROM area_layer_postal_codes own
          INNER JOIN area_layers ol ON ol.id = own.layer_id AND ol.area_id = "areas"."id"
          WHERE EXISTS (
            SELECT 1 FROM area_layer_postal_codes other
            INNER JOIN area_layers tl ON tl.id = other.layer_id AND tl.area_id != "areas"."id"
            INNER JOIN areas a2 ON a2.id = tl.area_id AND a2.is_archived = 'false'
            WHERE other.postal_code = own.postal_code
          )
        )`.as("conflictCount"),
        totalPostalCodeCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM postal_codes pc
          WHERE pc.granularity = "areas"."granularity"
            AND pc.country = "areas"."country"
            AND pc.is_active = 'true'
        )`.as("totalPostalCodeCount"),
      })
      .from(areas)
      .orderBy(desc(areas.updatedAt));
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

/** Lightweight fetch — only reads the country column. */
export async function getAreaCountry(id: number): Promise<string | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("areas", `area-${id}`);
  try {
    const row = await db.query.areas.findFirst({
      where: eq(areas.id, id),
      columns: { country: true },
    });
    return row?.country ?? null;
  } catch (error) {
    console.error("Error fetching area country:", error);
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

export async function getAreaDescription(id: number): Promise<string | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("areas", `area-${id}`);
  try {
    const row = await db.query.areas.findFirst({
      where: eq(areas.id, id),
      columns: { description: true },
    });
    return row?.description ?? null;
  } catch (error) {
    console.error("Error fetching area description:", error);
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

// Recent changes for a specific layer (for layer activity history popup)
export async function getLayerRecentChanges(layerId: number, limit = 10) {
  "use cache";
  cacheLife("seconds");
  cacheTag(`layer-${layerId}-history`);
  try {
    return await db
      .select({
        changeType: areaChanges.changeType,
        createdAt: areaChanges.createdAt,
        createdBy: areaChanges.createdBy,
        isUndone: areaChanges.isUndone,
        postalCodeCount: sql<number>`coalesce(jsonb_array_length(${areaChanges.changeData}->'postalCodes'), 0)`,
        sampleCodes: sql<
          string[] | null
        >`(${areaChanges.changeData}->'postalCodes')::jsonb`,
      })
      .from(areaChanges)
      .where(
        and(
          eq(areaChanges.entityId, layerId),
          inArray(areaChanges.changeType, [
            "add_postal_codes",
            "remove_postal_codes",
          ]),
          eq(areaChanges.isUndone, "false")
        )
      )
      .orderBy(desc(areaChanges.createdAt))
      .limit(limit);
  } catch (error) {
    console.error("Error fetching layer changes:", error);
    throw new Error("Failed to fetch layer changes", { cause: error });
  }
}

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

export type CrossAreaDuplicate = {
  postalCode: string;
  otherAreaId: number;
  otherAreaName: string;
};

/**
 * Find PLZ codes in the given area that also appear in other non-archived areas.
 * Returns deduplicated list of (postalCode, otherAreaId, otherAreaName).
 */
export async function getCrossAreaDuplicates(
  areaId: number
): Promise<CrossAreaDuplicate[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`area-${areaId}-duplicates`, "areas");
  try {
    // Single self-join: find codes from this area that also exist in other areas
    const result = await db.execute(sql`
      SELECT DISTINCT
        own.postal_code AS "postalCode",
        a.id            AS "otherAreaId",
        a.name          AS "otherAreaName"
      FROM area_layer_postal_codes own
      INNER JOIN area_layers       ol  ON ol.id      = own.layer_id
                                      AND ol.area_id  = ${areaId}
      INNER JOIN area_layer_postal_codes other ON other.postal_code = own.postal_code
      INNER JOIN area_layers       tl  ON tl.id      = other.layer_id
                                      AND tl.area_id != ${areaId}
      INNER JOIN areas             a   ON a.id        = tl.area_id
                                      AND a.is_archived = 'false'
      ORDER BY own.postal_code
    `);

    return result.rows as CrossAreaDuplicate[];
  } catch (error) {
    console.error("Error fetching cross-area duplicates:", error);
    return [];
  }
}

export interface RecentActivityItem {
  areaId: number;
  areaName: string;
  changeType: string;
  entityType: string;
  changeData: Record<string, unknown>;
  createdAt: string;
}

export async function getRecentActivity(
  limit = 12
): Promise<RecentActivityItem[]> {
  "use cache";
  cacheLife("seconds");
  cacheTag("recent-activity");
  try {
    const result = await db.execute(sql`
      SELECT
        a.id        AS "areaId",
        a.name      AS "areaName",
        ac.change_type  AS "changeType",
        ac.entity_type  AS "entityType",
        ac.change_data  AS "changeData",
        ac.created_at   AS "createdAt"
      FROM area_changes ac
      INNER JOIN areas a ON a.id = ac.area_id
      WHERE ac.is_undone = 'false'
      ORDER BY ac.created_at DESC
      LIMIT ${limit}
    `);
    return result.rows as unknown as RecentActivityItem[];
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    return [];
  }
}

export async function getAreaTags(
  areaId: number
): Promise<{ id: number; name: string; color: string }[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`area-${areaId}-tags`);
  try {
    const result = await db.execute(sql`
      SELECT at.id, at.name, at.color
      FROM area_tags at
      INNER JOIN area_tag_assignments ata ON ata.tag_id = at.id
      WHERE ata.area_id = ${areaId}
      ORDER BY at.name
    `);
    return result.rows as unknown as {
      id: number;
      name: string;
      color: string;
    }[];
  } catch {
    return [];
  }
}

export interface GlobalChangelogItem {
  areaId: number;
  areaName: string;
  changeType: string;
  entityType: string;
  layerName: string | null;
  previousLayerName: string | null;
  postalCodeCount: number;
  isUndone: string;
  createdBy: string | null;
  createdAt: string;
  sequenceNumber: number;
  versionNumber: number | null;
}

export async function getGlobalChangelog(options?: {
  limit?: number;
  offset?: number;
  areaId?: number;
  changeType?: string;
  includeUndone?: boolean;
}): Promise<{ items: GlobalChangelogItem[]; total: number }> {
  "use cache";
  cacheLife("seconds");
  cacheTag("recent-activity");

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  try {
    const whereClause = sql`
      ${options?.includeUndone ? sql`` : sql`ac.is_undone = 'false'`}
      ${options?.areaId ? sql`AND ac.area_id = ${options.areaId}` : sql``}
      ${options?.changeType ? sql`AND ac.change_type = ${options.changeType}` : sql``}
    `;

    const [itemsResult, countResult] = await Promise.all([
      db.execute(sql`
        SELECT
          ac.area_id          AS "areaId",
          a.name              AS "areaName",
          ac.change_type      AS "changeType",
          ac.entity_type      AS "entityType",
          ac.change_data->'layer'->>'name'       AS "layerName",
          ac.previous_data->'layer'->>'name'     AS "previousLayerName",
          COALESCE(jsonb_array_length(ac.change_data->'postalCodes'), 0) AS "postalCodeCount",
          ac.is_undone        AS "isUndone",
          ac.created_by       AS "createdBy",
          ac.created_at       AS "createdAt",
          ac.sequence_number  AS "sequenceNumber",
          ac.version_number   AS "versionNumber"
        FROM area_changes ac
        INNER JOIN areas a ON a.id = ac.area_id
        WHERE ${options?.includeUndone ? sql`TRUE` : sql`ac.is_undone = 'false'`}
          ${options?.areaId ? sql`AND ac.area_id = ${options.areaId}` : sql``}
          ${options?.changeType ? sql`AND ac.change_type = ${options.changeType}` : sql``}
        ORDER BY ac.created_at DESC, ac.sequence_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM area_changes ac
        WHERE ${options?.includeUndone ? sql`TRUE` : sql`ac.is_undone = 'false'`}
          ${options?.areaId ? sql`AND ac.area_id = ${options.areaId}` : sql``}
          ${options?.changeType ? sql`AND ac.change_type = ${options.changeType}` : sql``}
      `),
    ]);

    const total = (countResult.rows[0] as { total: number })?.total ?? 0;
    return {
      items: itemsResult.rows as unknown as GlobalChangelogItem[],
      total,
    };
  } catch (error) {
    console.error("Error fetching global changelog:", error);
    return { items: [], total: 0 };
  }
}
