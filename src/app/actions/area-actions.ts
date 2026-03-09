"use server";

import { eq, and, inArray, sql } from "drizzle-orm";
import type { FeatureCollection, Geometry } from "geojson";
import type { Route } from "next";
import { updateTag, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "../../lib/db";
import {
  areas,
  areaLayers,
  areaLayerPostalCodes,
  postalCodes,
} from "../../lib/schema/schema";
import { recordChangeAction } from "./change-tracking-actions";
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

  createdBy?: string;
}) {
  let redirectPath: string | null = null;

  try {
    // Create the area first

    const [area] = await db

      .insert(areas)

      .values({
        name: data.name,

        description: data.description,

        granularity: data.granularity || "5digit",
      })

      .returning();

    // Create the first version automatically

    const versionResult = await createVersionAction(area.id, {
      name: "Erstversion",

      description: "Automatically created first version",

      createdBy: data.createdBy,
    });

    if (!versionResult.success) {
      // If version creation fails, we should clean up the area

      await db.delete(areas).where(eq(areas.id, area.id));

      throw new Error("Erstversion konnte nicht erstellt werden");
    }

    updateTag("areas");

    updateTag(`area-${area.id}`);

    updateTag("undo-redo");

    updateTag(`area-${area.id}-undo-redo`);

    revalidatePath("/postal-codes", "layout");
    revalidatePath(`/postal-codes/${area.id}`, "page");

    // Set redirect path for finally block
    redirectPath = `/postal-codes/${area.id}`;
  } catch (error) {
    console.error("Error creating area:", error);

    return { success: false, error: "Failed to create area" };
  } finally {
    // Redirect in finally block for cleaner resource management
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

    updateTag("undo-redo");

    updateTag(`area-${id}-undo-redo`);

    revalidatePath("/postal-codes", "layout");
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

    revalidatePath("/postal-codes", "layout");

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

    updateTag("layers");

    updateTag(`area-${areaId}-layers`);

    updateTag(`area-${areaId}`);

    updateTag("undo-redo");

    updateTag(`area-${areaId}-undo-redo`);

    revalidatePath("/postal-codes", "layout");
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
        data.orderIndex !== undefined
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

    updateTag("layers");

    updateTag(`area-${areaId}-layers`);

    updateTag(`area-${areaId}`);

    updateTag("undo-redo");

    updateTag(`area-${areaId}-undo-redo`);

    revalidatePath("/postal-codes", "layout");
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

    updateTag("layers");

    updateTag(`area-${areaId}-layers`);

    updateTag(`area-${areaId}`);

    updateTag("undo-redo");

    updateTag(`area-${areaId}-undo-redo`);

    revalidatePath("/postal-codes", "layout");
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
): ServerActionResponse {
  try {
    // Validate inputs

    if (!areaId || !layerId || !postalCodes || postalCodes.length === 0) {
      return { success: false, error: "Invalid parameters" };
    }

    // Verify layer belongs to area

    const layer = await db.query.areaLayers.findFirst({
      where: and(eq(areaLayers.id, layerId), eq(areaLayers.areaId, areaId)),

      with: { postalCodes: true },
    });

    if (!layer) {
      return {
        success: false,

        error: "Layer not found or does not belong to area",
      };
    }

    // Get existing postal codes

    const existingCodes = layer.postalCodes?.map((pc) => pc.postalCode) || [];

    const newCodes = postalCodes.filter(
      (code) => !existingCodes.includes(code)
    );

    if (newCodes.length === 0) {
      return { success: true }; // No new codes to add
    }

    await db.insert(areaLayerPostalCodes).values(
      newCodes.map((code) => ({
        layerId,

        postalCode: code,
      }))
    );

    // Record change

    await recordChangeAction(areaId, {
      changeType: "add_postal_codes",

      entityType: "postal_code",

      entityId: layerId,

      changeData: {
        postalCodes: newCodes,

        layerId,
      },

      previousData: {
        postalCodes: existingCodes,
      },

      createdBy,
    });

    updateTag("layers");

    updateTag(`area-${areaId}-layers`);

    updateTag(`area-${areaId}`);

    updateTag("undo-redo");

    updateTag(`area-${areaId}-undo-redo`);

    revalidatePath("/postal-codes", "layout");
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
    // Validate inputs

    if (!areaId || !layerId || !postalCodes || postalCodes.length === 0) {
      return { success: false, error: "Invalid parameters" };
    }

    // Verify layer belongs to area

    const layer = await db.query.areaLayers.findFirst({
      where: and(eq(areaLayers.id, layerId), eq(areaLayers.areaId, areaId)),

      with: { postalCodes: true },
    });

    if (!layer) {
      return {
        success: false,

        error: "Layer not found or does not belong to area",
      };
    }

    const existingCodes = layer.postalCodes?.map((pc) => pc.postalCode) || [];

    const codesToRemove = postalCodes.filter((code) =>
      existingCodes.includes(code)
    );

    if (codesToRemove.length === 0) {
      return { success: true }; // No codes to remove
    }

    await db

      .delete(areaLayerPostalCodes)

      .where(
        and(
          eq(areaLayerPostalCodes.layerId, layerId),

          inArray(areaLayerPostalCodes.postalCode, postalCodes)
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

    updateTag("layers");

    updateTag(`area-${areaId}-layers`);

    updateTag(`area-${areaId}`);

    updateTag("undo-redo");

    updateTag(`area-${areaId}-undo-redo`);

    revalidatePath("/postal-codes", "layout");
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
}): ServerActionResponse<{ resultCodes: string[] }> {
  try {
    const { mode, granularity, selectedCodes } = data;

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
          sql`SELECT code FROM postal_codes WHERE granularity = ${granularity} AND code NOT IN (${sql.raw(
            selectedCodes.map(String).join(",")
          )}) AND ST_Touches(geometry, (SELECT ST_Union(geometry) AS geom FROM postal_codes WHERE code IN (${sql.raw(
            selectedCodes.map(String).join(",")
          )}))`
        );

        expandRows = rows;
      } else {
        const { rows } = await db.execute(
          sql`SELECT code FROM postal_codes WHERE granularity = ${granularity}`
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
            WHERE granularity = ${granularity} AND code IN (${sql.raw(
              codeList
            )})
            )
            SELECT code FROM postal_codes, hull
            WHERE granularity = ${granularity}
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
          sql`SELECT code FROM postal_codes WHERE granularity = ${granularity} AND code NOT IN (${sql.raw(
            selectedCodes.map(String).join(",")
          )}) AND ST_Intersects(geometry, (SELECT ST_Union(geometry) AS geom FROM postal_codes WHERE code IN (${sql.raw(
            selectedCodes.map(String).join(",")
          )}))`
        );

        gapRows = rows;
      } else {
        const { rows } = await db.execute(
          sql`SELECT code FROM postal_codes WHERE granularity = ${granularity}`
        );

        gapRows = rows;
      }

      resultCodes = gapRows.map((r) =>
        String((r as Record<string, unknown>)["code"])
      );
    }

    revalidatePath("/postal-codes", "layout");
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

export async function geocodeAction(address: string): ServerActionResponse<{
  latitude: number;

  longitude: number;

  postalCode?: string;
}> {
  try {
    // Use Nominatim for geocoding

    const nominatimUrl =
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        format: "json",

        q: address,

        addressdetails: "1",

        limit: "1",

        countrycodes: "de",

        "accept-language": "de,en",
      })}`;

    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "KRAUSS Territory Management/1.0",
      },
    });

    if (!response.ok) {
      throw new Error("Geocoding service unavailable");
    }

    const results = await response.json();

    if (results.length === 0) {
      throw new Error("No results found for address");
    }

    const result = results[0];

    revalidatePath("/postal-codes", "layout");
    return {
      success: true,

      data: {
        latitude: parseFloat(result.lat),

        longitude: parseFloat(result.lon),

        postalCode: result.address?.postcode,
      },
    };
  } catch (error) {
    console.error("Error in geocoding:", error);

    return { success: false, error: "Geocoding failed" };
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

    const nominatimUrl =
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        format: "json",

        q: query,

        addressdetails: "1",

        limit: limit.toString(),

        countrycodes: "de",

        "accept-language": "de,en",
      })}`;

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

    revalidatePath("/postal-codes", "layout");
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

export async function searchPostalCodesByLocationAction(data: {
  location: string;

  granularity: string;

  limit?: number;
}): ServerActionResponse<{
  location: string;

  searchVariants: string[];

  granularity: string;

  postalCodes: string[];

  count: number;

  features: FeatureCollection;
}> {
  try {
    const { location, granularity, limit = 50 } = data;

    // Get search variants (simplified version)

    const searchVariants = [location.toLowerCase()];

    // Search in database using property fields

    const searchConditions = searchVariants.map(
      (variant) =>
        sql`properties->>'name' ILIKE ${`%${variant}%`} OR
          properties->>'city' ILIKE ${`%${variant}%`} OR
          properties->>'stadt' ILIKE ${`%${variant}%`} OR
          properties->>'state' ILIKE ${`%${variant}%`} OR
          properties->>'bundesland' ILIKE ${`%${variant}%`} OR
          properties->>'region' ILIKE ${`%${variant}%`} OR
          properties->>'ort' ILIKE ${`%${variant}%`} OR
          properties->>'gemeinde' ILIKE ${`%${variant}%`}`
    );

    const whereCondition = sql`(${searchConditions.reduce(
      (acc, condition, index) =>
        index === 0 ? condition : sql`${acc} OR ${condition}`
    )}) AND granularity = ${granularity}`;
    const results = (await db

      .select({
        code: postalCodes.code,

        granularity: postalCodes.granularity,

        geometry: sql<string>`ST_AsGeoJSON(${postalCodes.geometry})`,

        properties: postalCodes.properties,
      })

      .from(postalCodes)

      .where(whereCondition)

      .limit(limit)) as {
      code: string;

      granularity: string;

      geometry: string;

      properties: unknown;
    }[];
    // Create features array

    const features = results.map((result) => ({
      type: "Feature" as const,

      properties: {
        code: result.code,

        granularity: result.granularity,

        ...((result.properties as object) || {}),
      },

      geometry: JSON.parse(result.geometry) as Geometry,
    }));

    return {
      success: true,

      data: {
        location,

        searchVariants,

        granularity,

        postalCodes: results.map((r) => r.code),

        count: results.length,

        features: {
          type: "FeatureCollection" as const,
          features,
        },
      },
    };
  } catch (error) {
    console.error("Error in location search:", error);

    return { success: false, error: "Location search failed" };
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

    const nominatimUrl =
      `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        format: "geojson",

        q: areaName,

        polygon_geojson: "1",

        addressdetails: "1",

        limit: "5",

        countrycodes: "de",

        "accept-language": "de,en",
      })}`;

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
