"use server";

import { eq } from "drizzle-orm";
import { updateTag, revalidatePath, refresh } from "next/cache";

import { db } from "../../lib/db";
import { areaLayers, areaLayerPostalCodes } from "../../lib/schema/schema";
import { recordChangeAction } from "./change-tracking-actions";

export interface BulkImportLayer {
  name: string;
  postalCodes: string[];
}

export interface BulkImportResult {
  success: boolean;
  createdLayers: number;
  updatedLayers: number;
  totalPostalCodes: number;
  errors?: string[];
  layerIds?: number[];
}

const BATCH_SIZE = 500; // Process in batches for performance

/**
 * Bulk import postal codes and layers with upsert functionality
 */
export async function bulkImportPostalCodesAndLayers(
  areaId: number,
  layers: BulkImportLayer[],
  createdBy?: string
): Promise<BulkImportResult> {
  let createdLayers = 0;
  let updatedLayers = 0;
  let totalPostalCodes = 0;
  const layerIds: number[] = [];
  const errors: string[] = [];

  try {
    // Get existing layers for this area (outside transaction)
    const existingLayers = await db.query.areaLayers.findMany({
      where: eq(areaLayers.areaId, areaId),
      with: { postalCodes: true },
    });

    type ExistingLayer = (typeof existingLayers)[number];
    const existingLayerMap = new Map<string, ExistingLayer>(
      existingLayers.map((l) => [l.name.toLowerCase(), l])
    );

    const processLayerData = async (
      layerData: BulkImportLayer,
      layerNameLower: string,
      existingLayer: ExistingLayer | undefined,
      uniquePostalCodes: string[],
      currentCreatedLayers: number,
      currentUpdatedLayers: number
    ) =>
      db.transaction(async (tx) => {
        let txLayerId: number;
        let addedPostalCodes = 0;
        let isNewLayer = false;
        let newLayerData = null;

        if (existingLayer) {
          txLayerId = existingLayer.id;
          const currentCodes = new Set(
            existingLayer.postalCodes?.map((pc) => pc.postalCode) || []
          );
          const newCodes = uniquePostalCodes.filter(
            (code) => !currentCodes.has(code)
          );

          if (newCodes.length > 0) {
            const codeRows = newCodes.map((code) => ({
              layerId: txLayerId,
              postalCode: code,
            }));
            for (let i = 0; i < codeRows.length; i += BATCH_SIZE) {
              const batch = codeRows.slice(i, i + BATCH_SIZE);
              await tx.insert(areaLayerPostalCodes).values(batch);
            }
            addedPostalCodes = newCodes.length;

            await recordChangeAction(areaId, {
              changeType: "add_postal_codes",
              entityType: "postal_code",
              entityId: txLayerId,
              changeData: {
                postalCodes: newCodes,
                layerId: txLayerId,
                source: "bulk_import",
              },
              previousData: {
                postalCodes: [...currentCodes],
              },
              createdBy,
            });
          }
        } else {
          const [newLayer] = await tx
            .insert(areaLayers)
            .values({
              areaId,
              name: layerData.name,
              color: generateLayerColor(
                existingLayers.length +
                  currentCreatedLayers +
                  currentUpdatedLayers
              ),
              opacity: 70,
              isVisible: "true",
              orderIndex: existingLayers.length + currentCreatedLayers,
            })
            .returning();

          txLayerId = newLayer.id;
          isNewLayer = true;
          newLayerData = newLayer;

          if (uniquePostalCodes.length > 0) {
            const codeRows = uniquePostalCodes.map((code) => ({
              layerId: txLayerId,
              postalCode: code,
            }));
            for (let i = 0; i < codeRows.length; i += BATCH_SIZE) {
              const batch = codeRows.slice(i, i + BATCH_SIZE);
              await tx.insert(areaLayerPostalCodes).values(batch);
            }
            addedPostalCodes = uniquePostalCodes.length;
          }

          await recordChangeAction(areaId, {
            changeType: "create_layer",
            entityType: "layer",
            entityId: txLayerId,
            changeData: {
              layer: {
                areaId,
                name: layerData.name,
                color: newLayer.color,
                opacity: newLayer.opacity,
                isVisible: newLayer.isVisible,
                orderIndex: newLayer.orderIndex,
              },
              postalCodes: uniquePostalCodes,
              source: "bulk_import",
            },
            createdBy,
          });
        }

        return { txLayerId, addedPostalCodes, isNewLayer, newLayerData };
      });

    // Process each layer in its own transaction for fault tolerance
    for (const layerData of layers) {
      try {
        const layerNameLower = layerData.name.toLowerCase();
        const existingLayer = existingLayerMap.get(layerNameLower);

        const uniquePostalCodes = [...new Set(layerData.postalCodes)];
        if (uniquePostalCodes.length === 0) {
          continue;
        }

        const txResult = await processLayerData(
          layerData,
          layerNameLower,
          existingLayer,
          uniquePostalCodes,
          createdLayers,
          updatedLayers
        );

        if (txResult.isNewLayer && txResult.newLayerData) {
          createdLayers++;
          existingLayerMap.set(layerNameLower, {
            ...txResult.newLayerData,
            postalCodes: uniquePostalCodes.map((code) => ({
              id: 0,
              layerId: txResult.txLayerId,
              postalCode: code,
              createdAt: new Date().toISOString(),
            })),
          });
        } else {
          updatedLayers++;
        }

        totalPostalCodes += txResult.addedPostalCodes;
        layerIds.push(txResult.txLayerId);
      } catch (error) {
        const errorMsg = `Error processing layer "${layerData.name}": ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
        console.error(errorMsg, error);
        errors.push(errorMsg);
        // Continue processing other layers
      }
    }

    // Update cache tags and refresh
    updateTag("layers");
    updateTag(`area-${areaId}-layers`);
    updateTag(`area-${areaId}`);
    updateTag("undo-redo-status");
    refresh();
    revalidatePath("/postal-codes", "layout");

    return {
      success: errors.length === 0,
      createdLayers,
      updatedLayers,
      totalPostalCodes,
      layerIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error("Bulk import error:", error);
    return {
      success: false,
      createdLayers: 0,
      updatedLayers: 0,
      totalPostalCodes: 0,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

/**
 * Generate distinct colors for layers
 */
function generateLayerColor(index: number): string {
  const colors = [
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f97316", // orange
    "#06b6d4", // cyan
    "#84cc16", // lime
    "#a855f7", // purple
    "#f43f5e", // rose
  ];

  return colors[index % colors.length];
}

/**
 * Validate postal codes in batch before import
 */
export async function validatePostalCodesBatch(
  postalCodes: string[],
  _areaId: number
): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const code of postalCodes) {
    // Basic validation for German postal codes
    if (/^\d{1,5}$/.test(code)) {
      valid.push(code);
    } else {
      invalid.push(code);
    }
  }

  return { valid, invalid };
}
