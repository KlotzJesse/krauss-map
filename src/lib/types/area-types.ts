import type { InferSelectModel } from "drizzle-orm";

import type { areas, areaLayers, areaLayerPostalCodes } from "../schema/schema";

export type Area = InferSelectModel<typeof areas>;

/** Lightweight area type for sidebar/list display — only id, name, granularity, isArchived, updatedAt */
export type AreaSummary = Pick<
  Area,
  "id" | "name" | "granularity" | "isArchived" | "updatedAt"
>;

export type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

export type AreaWithLayers = Area & {
  layers: Layer[];
};
export type PostalCodeEntry = InferSelectModel<typeof areaLayerPostalCodes>;

export interface CreateAreaData {
  name: string;
  description?: string;
  granularity?: string;
}

export interface UpdateAreaData {
  name?: string;
  description?: string;
  granularity?: string;
}
