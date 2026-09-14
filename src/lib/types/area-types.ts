import type { InferSelectModel } from "drizzle-orm";

import type { CountryCode } from "@/lib/config/countries";

import type { areas, areaLayers, areaLayerPostalCodes } from "../schema/schema";

export type Area = InferSelectModel<typeof areas>;

/** Lightweight area type for sidebar/list display — only id, name, granularity, isArchived, updatedAt, country */
export type AreaSummary = Pick<
  Area,
  | "id"
  | "name"
  | "granularity"
  | "isArchived"
  | "updatedAt"
  | "country"
  | "description"
> & {
  postalCodeCount?: number | null;
  uniquePostalCodeCount?: number | null;
  layerCount?: number | null;
  conflictCount?: number | null;
  totalPostalCodeCount?: number | null;
  tags?: { id: number; name: string; color: string }[];
};

export type Layer = InferSelectModel<typeof areaLayers> & {
  postalCodes?: { postalCode: string }[];
};

/**
 * Wire format for layers crossing the server -> client RSC boundary.
 * Postal codes travel as a flat string array instead of `{ postalCode }[]`
 * objects; the wrapper objects cost ~20 bytes each and an area can carry
 * tens of thousands of them. The client rehydrates this back into `Layer`.
 */
export type LayerWire = Omit<Layer, "postalCodes"> & {
  codes: string[];
};

/**
 * A change to the area's layer list that the client can apply itself.
 *
 * The view owns the one authoritative copy of the layers; every panel and the
 * map read from it. Anything that mutates layers describes the mutation with
 * one of these instead of keeping a second copy, which is what used to let the
 * panel and the map disagree about which layers exist.
 *
 * `replace` is the escape hatch for server-side rewrites — undo, redo, version
 * restore, import, merge, split, granularity change — where the client cannot
 * predict the result and re-reads it instead.
 */
export type LayerChange =
  | { type: "create"; layer: Layer }
  | { type: "update"; id: number; patch: Partial<Layer> }
  | { type: "delete"; id: number }
  | { type: "replace"; layers: Layer[] };

/** Apply a {@link LayerChange} to a layer list, returning a new list. */
export function reduceLayerChange(layers: Layer[], change: LayerChange): Layer[] {
  switch (change.type) {
    case "create":
      return layers.some((layer) => layer.id === change.layer.id)
        ? layers
        : [...layers, change.layer];
    case "update":
      return layers.map((layer) =>
        layer.id === change.id ? { ...layer, ...change.patch } : layer
      );
    case "delete":
      return layers.filter((layer) => layer.id !== change.id);
    case "replace":
      return change.layers;
  }
}

export type AreaWithLayers = Area & {
  layers: Layer[];
};
export type PostalCodeEntry = InferSelectModel<typeof areaLayerPostalCodes>;

export interface CreateAreaData {
  name: string;
  description?: string;
  granularity?: string;
  country?: CountryCode;
}

export interface UpdateAreaData {
  name?: string;
  description?: string;
  granularity?: string;
}
