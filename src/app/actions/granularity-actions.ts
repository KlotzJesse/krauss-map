"use server";

import { eq, and, like, or } from "drizzle-orm";
import { updateTag } from "next/cache";

import { getGranularityLevel } from "@/lib/utils/granularity-utils";

import { db } from "../../lib/db";
import {
  areas,
  areaLayers,
  areaLayerPostalCodes,
  postalCodes,
} from "../../lib/schema/schema";

type ServerActionResponse<T = void> = Promise<{
  success: boolean;

  data?: T;

  error?: string;
}>;

interface GranularityChangeResult {
  migratedLayers: number;

  addedPostalCodes: number;

  removedPostalCodes: number;
}

/**
 * Changes the granularity of an area and migrates postal codes accordingly
 * - When upgrading (3digit -> 5digit): Expands codes to include all matching higher-granularity codes
 * - When downgrading (5digit -> 3digit): Removes all postal codes (requires confirmation from UI)
 */

export async function changeAreaGranularityAction(
  areaId: number,

  newGranularity: string,

  currentGranularity: string
): ServerActionResponse<GranularityChangeResult> {
  try {
    const currentLevel = getGranularityLevel(currentGranularity);

    const newLevel = getGranularityLevel(newGranularity);

    // Check if this is an upgrade (moving to higher granularity)

    const isUpgrade = newLevel > currentLevel;

    let migratedLayers = 0;

    let addedPostalCodes = 0;

    let removedPostalCodes = 0;

    await db.transaction(async (tx) => {
      // Get all layers for this area with their postal codes

      const layers = await tx.query.areaLayers.findMany({
        where: eq(areaLayers.areaId, areaId),

        with: {
          postalCodes: true,
        },
      });

      if (isUpgrade && layers.length > 0) {
        // UPGRADE: Expand postal codes to higher granularity

        for (const layer of layers) {
          if (!layer.postalCodes || layer.postalCodes.length === 0) {
            continue;
          }

          const currentCodes = layer.postalCodes.map((pc) => pc.postalCode);

          // Single batch query instead of N+1 per-code queries
          const allMatchingRows = await tx
            .select({ code: postalCodes.code })
            .from(postalCodes)
            .where(
              and(
                eq(postalCodes.granularity, newGranularity),
                or(
                  ...currentCodes.map((code) =>
                    like(postalCodes.code, `${code}%`)
                  )
                )
              )
            );

          const expandedCodes = new Set(allMatchingRows.map((r) => r.code));

          if (expandedCodes.size > 0) {
            // Delete old postal codes for this layer

            await tx

              .delete(areaLayerPostalCodes)

              .where(eq(areaLayerPostalCodes.layerId, layer.id));

            removedPostalCodes += currentCodes.length;

            // Insert new expanded postal codes

            await tx.insert(areaLayerPostalCodes).values(
              [...expandedCodes].map((code) => ({
                layerId: layer.id,

                postalCode: code,
              }))
            );

            addedPostalCodes += expandedCodes.size;

            migratedLayers++;
          }
        }
      } else if (!isUpgrade && layers.length > 0) {
        // DOWNGRADE: Remove all postal codes (data loss scenario)

        // This should only happen after user confirmation

        for (const layer of layers) {
          if (!layer.postalCodes || layer.postalCodes.length === 0) {
            continue;
          }

          removedPostalCodes += layer.postalCodes.length;

          await tx

            .delete(areaLayerPostalCodes)

            .where(eq(areaLayerPostalCodes.layerId, layer.id));

          migratedLayers++;
        }
      }

      // Update the area's granularity

      await tx

        .update(areas)

        .set({
          granularity: newGranularity,

          updatedAt: new Date().toISOString(),
        })

        .where(eq(areas.id, areaId));
    });

    updateTag(`area-${areaId}`);
    updateTag(`area-${areaId}-layers`);

    return {
      success: true,

      data: {
        migratedLayers,

        addedPostalCodes,

        removedPostalCodes,
      },
    };
  } catch (error) {
    console.error("Error changing area granularity:", error);

    return {
      success: false,

      error: "Failed to change granularity",
    };
  }
}

/**
 * Gets all available postal codes at a specific granularity that match a prefix
 * Useful for previewing what codes will be selected during migration
 */

export async function getMatchingPostalCodesAction(
  prefix: string,

  targetGranularity: string
): ServerActionResponse<string[]> {
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

    return {
      success: true,

      data: matchingCodes.map((mc) => mc.code),
    };
  } catch (error) {
    console.error("Error fetching matching postal codes:", error);

    return {
      success: false,

      error: "Failed to fetch matching postal codes",
    };
  }
}
