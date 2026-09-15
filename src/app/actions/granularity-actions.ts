"use server";

import { eq, and, like, or } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { FRESH_AFTER_EDIT } from "../../lib/cache/after-edit";

import {
  type CountryCode,
  detectCountryFromCode,
  formatWithPrefix,
} from "@/lib/config/countries";
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
      const area = await tx.query.areas.findFirst({
        where: eq(areas.id, areaId),
        columns: { country: true },
      });
      const areaCountry = (area?.country ?? "DE") as CountryCode;

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

          // Stored codes are prefixed ("D-80"); postal_codes.code is bare
          // ("80331"). Matching the two directly found nothing, so upgrading
          // granularity left every layer untouched — and would have inserted
          // bare codes that the CHECK constraint rejects. Match on
          // (country, bare prefix) and insert in stored form.
          const prefixes = new Map<string, { country: CountryCode; raw: string }>();
          for (const stored of currentCodes) {
            const detected = detectCountryFromCode(stored);
            if (!detected.code) continue;
            const country = (detected.country ?? areaCountry) as CountryCode;
            prefixes.set(`${country}:${detected.code}`, {
              country,
              raw: detected.code,
            });
          }
          if (prefixes.size === 0) {
            continue;
          }

          // Single batch query instead of N+1 per-code queries
          const allMatchingRows = await tx
            .select({
              id: postalCodes.id,
              code: postalCodes.code,
              country: postalCodes.country,
            })
            .from(postalCodes)
            .where(
              and(
                eq(postalCodes.granularity, newGranularity),
                or(
                  ...[...prefixes.values()].map((prefix) =>
                    and(
                      eq(postalCodes.country, prefix.country),
                      like(postalCodes.code, `${prefix.raw}%`)
                    )
                  )
                )
              )
            );

          const expandedCodes = new Map<string, number>();
          for (const row of allMatchingRows) {
            expandedCodes.set(
              formatWithPrefix(row.code, row.country as CountryCode),
              row.id
            );
          }

          if (expandedCodes.size > 0) {
            // Delete old postal codes for this layer

            await tx

              .delete(areaLayerPostalCodes)

              .where(eq(areaLayerPostalCodes.layerId, layer.id));

            removedPostalCodes += currentCodes.length;

            // Insert new expanded postal codes

            await tx.insert(areaLayerPostalCodes).values(
              [...expandedCodes].map(([postalCode, postalCodeId]) => ({
                layerId: layer.id,

                postalCode,

                postalCodeId,
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

    revalidateTag(`area-${areaId}`, FRESH_AFTER_EDIT);
    revalidateTag(`area-${areaId}-layers`, FRESH_AFTER_EDIT);
    // Tags, counts and granularity show in the area list.
    revalidateTag("areas", FRESH_AFTER_EDIT);
    revalidateTag("recent-activity", FRESH_AFTER_EDIT);

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
