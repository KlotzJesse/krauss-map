import { relations } from "drizzle-orm";

import {
  areas,
  areaVersions,
  areaLayers,
  areaLayerPostalCodes,
  areaChanges,
  areaUndoStacks,
  postalCodes,
} from "./schema";

export const areasRelations = relations(areas, ({ many, one }) => ({
  versions: many(areaVersions),
  layers: many(areaLayers),
  changes: many(areaChanges),
  undoStack: one(areaUndoStacks, {
    fields: [areas.id],
    references: [areaUndoStacks.areaId],
  }),
  // currentVersion relation removed due to composite primary key
}));

export const areaVersionsRelations = relations(
  areaVersions,
  ({ one, many }) => ({
    area: one(areas, {
      fields: [areaVersions.areaId],
      references: [areas.id],
    }),
    parentVersion: one(areaVersions, {
      fields: [
        areaVersions.parentVersionAreaId,
        areaVersions.parentVersionNumber,
      ],
      references: [areaVersions.areaId, areaVersions.versionNumber],
      relationName: "parentChild",
    }),
    childVersions: many(areaVersions, {
      relationName: "parentChild",
    }),
    changes: many(areaChanges),
  })
);

export const areaLayersRelations = relations(areaLayers, ({ one, many }) => ({
  area: one(areas, {
    fields: [areaLayers.areaId],
    references: [areas.id],
  }),
  postalCodes: many(areaLayerPostalCodes),
}));

export const areaLayerPostalCodesRelations = relations(
  areaLayerPostalCodes,
  ({ one }) => ({
    layer: one(areaLayers, {
      fields: [areaLayerPostalCodes.layerId],
      references: [areaLayers.id],
    }),
    postalCode: one(postalCodes, {
      fields: [areaLayerPostalCodes.postalCodeId],
      references: [postalCodes.id],
    }),
  })
);

export const areaChangesRelations = relations(areaChanges, ({ one }) => ({
  area: one(areas, {
    fields: [areaChanges.areaId],
    references: [areas.id],
  }),
  version: one(areaVersions, {
    fields: [areaChanges.versionAreaId, areaChanges.versionNumber],
    references: [areaVersions.areaId, areaVersions.versionNumber],
  }),
}));

export const areaUndoStacksRelations = relations(areaUndoStacks, ({ one }) => ({
  area: one(areas, {
    fields: [areaUndoStacks.areaId],
    references: [areas.id],
  }),
}));
