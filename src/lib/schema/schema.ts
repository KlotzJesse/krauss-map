import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

import { multiPolygon } from "../../db/geoTypes";

export const performanceMetrics = pgTable(
  "performance_metrics",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    component: varchar({ length: 100 }).notNull(),

    metricType: varchar("metric_type", { length: 50 }).notNull(),

    value: varchar({ length: 20 }).notNull(),

    metadata: jsonb(),

    userAgent: text("user_agent"),

    timestamp: timestamp({ mode: "string" }).defaultNow(),
  },

  () => [
    index("idx_perf_component"),

    index("idx_perf_timestamp"),

    index("idx_perf_type"),
  ]
);

// Note: spatial_ref_sys is a PostGIS system table, not managed by Drizzle

// export const spatialRefSys = pgTable("spatial_ref_sys", {

// 	srid: integer().notNull(),

// 	authName: varchar("auth_name", { length: 256 }),

// 	authSrid: integer("auth_srid"),

// 	srtext: varchar({ length: 2048 }),

// 	proj4Text: varchar({ length: 2048 }),

// }, () => [

// 	check("spatial_ref_sys_srid_check", sql`(srid > 0) AND (srid <= 998999)`),

// ]);

export const apiCache = pgTable(
  "api_cache",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    cacheKey: varchar("cache_key", { length: 255 }).notNull(),

    data: jsonb().notNull(),

    expiresAt: timestamp("expires_at", { mode: "string" }).notNull(),

    createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),

    updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow(),
  },

  (table) => [
    index("idx_api_cache_expires").using(
      "btree",

      table.expiresAt.asc().nullsLast().op("timestamp_ops")
    ),

    index("idx_api_cache_key").using(
      "btree",

      table.cacheKey.asc().nullsLast().op("text_ops")
    ),

    unique("api_cache_cache_key_unique").on(table.cacheKey),
  ]
);

export const errorLogs = pgTable(
  "error_logs",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    errorCode: varchar("error_code", { length: 50 }),

    message: text().notNull(),

    stack: text(),

    context: jsonb(),

    userAgent: text("user_agent"),

    url: text(),

    userId: varchar("user_id", { length: 100 }),

    timestamp: timestamp({ mode: "string" }).defaultNow(),
  },

  (table) => [
    index("idx_error_code").using(
      "btree",

      table.errorCode.asc().nullsLast().op("text_ops")
    ),

    index("idx_error_timestamp").using(
      "btree",

      table.timestamp.asc().nullsLast().op("timestamp_ops")
    ),

    index("idx_error_user").using(
      "btree",

      table.userId.asc().nullsLast().op("text_ops")
    ),
  ]
);

export const postalCodes = pgTable(
  "postal_codes",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    code: varchar({ length: 10 }).notNull(),

    granularity: varchar({ length: 20 }).notNull(),

    country: varchar({ length: 2 }).notNull().default("DE"),

    isActive: varchar("is_active", { length: 5 }).notNull().default("true"),

    sourceRelease: varchar("source_release", { length: 50 }),

    geometry: multiPolygon("geometry").notNull(),

    properties: jsonb(),

    bbox: jsonb(),

    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()

      .notNull(),

    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    index("idx_postal_codes_code").using(
      "btree",

      table.code.asc().nullsLast().op("text_ops")
    ),

    index("idx_postal_codes_geometry").using(
      "gist",

      table.geometry.asc().nullsLast().op("gist_geometry_ops_2d")
    ),

    index("idx_postal_codes_granularity").using(
      "btree",

      table.granularity.asc().nullsLast().op("text_ops")
    ),

    index("idx_postal_codes_granularity_code").using(
      "btree",

      table.granularity.asc().nullsLast().op("text_ops"),

      table.code.asc().nullsLast().op("text_ops")
    ),

    index("idx_postal_codes_country").using(
      "btree",

      table.country.asc().nullsLast().op("text_ops")
    ),

    index("idx_postal_codes_country_granularity").using(
      "btree",

      table.country.asc().nullsLast().op("text_ops"),

      table.granularity.asc().nullsLast().op("text_ops")
    ),

    unique("postal_codes_country_granularity_code_unique").on(
      table.country,

      table.granularity,

      table.code
    ),
  ]
);

export const states = pgTable(
  "states",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    name: varchar({ length: 255 }).notNull(),

    code: varchar({ length: 10 }).notNull(),

    country: varchar({ length: 2 }).notNull().default("DE"),

    geometry: multiPolygon("geometry").notNull(),

    properties: jsonb(),

    bbox: jsonb(),

    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()

      .notNull(),

    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    index("idx_states_code").using(
      "btree",

      table.code.asc().nullsLast().op("text_ops")
    ),

    index("idx_states_geometry").using(
      "gist",

      table.geometry.asc().nullsLast().op("gist_geometry_ops_2d")
    ),

    index("idx_states_name").using(
      "btree",

      table.name.asc().nullsLast().op("text_ops")
    ),

    index("idx_states_country").using(
      "btree",

      table.country.asc().nullsLast().op("text_ops")
    ),

    unique("states_country_code_unique").on(table.country, table.code),
  ]
);

export const countryShapes = pgTable(
  "country_shapes",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    country: varchar({ length: 2 }).notNull(),

    name: varchar({ length: 255 }).notNull(),

    iso3: varchar({ length: 3 }),

    isActive: varchar("is_active", { length: 5 }).notNull().default("true"),

    sourceRelease: varchar("source_release", { length: 50 }),

    geometry: multiPolygon("geometry").notNull(),

    properties: jsonb(),

    bbox: jsonb(),

    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()

      .notNull(),

    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    index("idx_country_shapes_country").using(
      "btree",

      table.country.asc().nullsLast().op("text_ops")
    ),

    index("idx_country_shapes_geometry").using(
      "gist",

      table.geometry.asc().nullsLast().op("gist_geometry_ops_2d")
    ),

    index("idx_country_shapes_is_active").using(
      "btree",

      table.isActive.asc().nullsLast().op("text_ops")
    ),

    unique("country_shapes_country_unique").on(table.country),
  ]
);

// Area management tables for versioning and multi-layer support

export const areas = pgTable(
  "areas",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    name: varchar({ length: 255 }).notNull(),

    description: text(),

    granularity: varchar({ length: 20 }).notNull().default("5digit"),

    country: varchar({ length: 2 }).notNull().default("DE"),

    isArchived: varchar("is_archived", { length: 5 })
      .notNull()

      .default("false"),

    currentVersionNumber: integer("current_version_number"), // Current active version number for this area

    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()

      .notNull(),

    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    index("idx_areas_name").using(
      "btree",

      table.name.asc().nullsLast().op("text_ops")
    ),

    index("idx_areas_created_at").using(
      "btree",

      table.createdAt.asc().nullsLast().op("timestamp_ops")
    ),

    index("idx_areas_is_archived").using(
      "btree",

      table.isArchived.asc().nullsLast().op("text_ops")
    ),

    index("idx_areas_current_version").using(
      "btree",

      table.currentVersionNumber.asc().nullsLast().op("int4_ops")
    ),

    index("idx_areas_country").using(
      "btree",

      table.country.asc().nullsLast().op("text_ops")
    ),
  ]
);

export const areaVersions = pgTable(
  "area_versions",

  {
    areaId: integer("area_id").notNull(),

    versionNumber: integer("version_number").notNull().default(0), // Auto-generated by trigger scoped to areaId (trigger overrides default)

    name: varchar({ length: 255 }),

    description: text(),

    snapshot: jsonb().notNull(), // Full snapshot of layers and postal codes

    changesSummary: text("changes_summary"), // Human-readable summary of changes

    parentVersionAreaId: integer("parent_version_area_id"), // Part of composite FK to parent version

    parentVersionNumber: integer("parent_version_number"), // Part of composite FK to parent version

    branchName: varchar("branch_name", { length: 255 }), // Name for branch versions

    isActive: varchar("is_active", { length: 5 }).notNull().default("false"), // Current working version

    changeCount: integer("change_count").notNull().default(0), // Number of changes in this version

    createdBy: varchar("created_by", { length: 255 }),

    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    index("idx_area_versions_area_id").using(
      "btree",

      table.areaId.asc().nullsLast().op("int4_ops")
    ),

    index("idx_area_versions_created_at").using(
      "btree",

      table.createdAt.asc().nullsLast().op("timestamp_ops")
    ),

    index("idx_area_versions_parent").using(
      "btree",

      table.parentVersionAreaId.asc().nullsLast().op("int4_ops"),

      table.parentVersionNumber.asc().nullsLast().op("int4_ops")
    ),

    index("idx_area_versions_is_active").using(
      "btree",

      table.areaId.asc().nullsLast().op("int4_ops"),

      table.isActive.asc().nullsLast().op("text_ops")
    ),

    primaryKey(table.areaId, table.versionNumber),
  ]
);

export const areaLayers = pgTable(
  "area_layers",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    areaId: integer("area_id").notNull(),

    name: varchar({ length: 255 }).notNull(),

    color: varchar({ length: 20 }).notNull().default("#3b82f6"), // Hex color code

    opacity: integer().notNull().default(70), // 0-100

    isVisible: varchar("is_visible", { length: 5 }).notNull().default("true"),

    orderIndex: integer("order_index").notNull().default(0), // For layer ordering

    notes: text("notes"), // Optional notes/description for the layer

    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()

      .notNull(),

    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    index("idx_area_layers_area_id").using(
      "btree",

      table.areaId.asc().nullsLast().op("int4_ops")
    ),

    index("idx_area_layers_order").using(
      "btree",

      table.areaId.asc().nullsLast().op("int4_ops"),

      table.orderIndex.asc().nullsLast().op("int4_ops")
    ),
  ]
);

export const areaLayerPostalCodes = pgTable(
  "area_layer_postal_codes",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    layerId: integer("layer_id").notNull(),

    postalCode: varchar("postal_code", { length: 10 }).notNull(),

    postalCodeId: integer("postal_code_id"),

    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    index("idx_area_layer_postal_codes_layer_id").using(
      "btree",

      table.layerId.asc().nullsLast().op("int4_ops")
    ),

    index("idx_area_layer_postal_codes_postal_code").using(
      "btree",

      table.postalCode.asc().nullsLast().op("text_ops")
    ),

    unique("area_layer_postal_codes_layer_id_postal_code_unique").on(
      table.layerId,

      table.postalCode
    ),

    foreignKey({
      columns: [table.postalCodeId],

      foreignColumns: [postalCodes.id],

      name: "fk_area_layer_postal_codes_postal_code_id",
    }).onDelete("set null"),
  ]
);

// Change tracking table for event sourcing and undo/redo

export const areaChanges = pgTable(
  "area_changes",

  {
    // Combined primary key: (area_id, version_area_id, version_number, sequence_number)

    // Changes are unique within area + version + sequence context

    areaId: integer("area_id").notNull(),

    versionAreaId: integer("version_area_id"), // Part of composite PK and FK to area_versions

    versionNumber: integer("version_number"), // Part of composite PK and FK to area_versions (nullable - changes before first save)

    sequenceNumber: integer("sequence_number").notNull().default(0), // Part of composite PK - auto-generated by trigger scoped to (areaId, versionAreaId, versionNumber) (trigger overrides default)

    changeType: varchar("change_type", { length: 50 }).notNull(), // create_layer, update_layer, delete_layer, add_postal_codes, remove_postal_codes, etc.

    entityType: varchar("entity_type", { length: 50 }).notNull(), // area, layer, postal_code

    entityId: integer("entity_id"), // ID of affected entity (nullable)

    changeData: jsonb("change_data").notNull(), // Full details of the change

    previousData: jsonb("previous_data"), // Previous state for undo (nullable)

    isUndone: varchar("is_undone", { length: 5 }).notNull().default("false"), // Track if change was undone

    createdBy: varchar("created_by", { length: 255 }),

    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    // Combined primary key: changes are unique within area + version + sequence

    primaryKey(
      table.areaId,

      table.versionAreaId,

      table.versionNumber,

      table.sequenceNumber
    ),

    index("idx_area_changes_created_at").using(
      "btree",

      table.createdAt.asc().nullsLast().op("timestamp_ops")
    ),

    index("idx_area_changes_entity").using(
      "btree",

      table.entityType.asc().nullsLast().op("text_ops"),

      table.entityId.asc().nullsLast().op("int4_ops")
    ),

    // Foreign key to areas

    foreignKey({
      columns: [table.areaId],

      foreignColumns: [areas.id],

      name: "fk_area_changes_area_id",
    }).onDelete("cascade"),

    // Foreign key to area_versions (composite)

    foreignKey({
      columns: [table.versionAreaId, table.versionNumber],

      foreignColumns: [areaVersions.areaId, areaVersions.versionNumber],

      name: "fk_area_changes_version",
    }),
  ]
);

// Undo/redo stack tracking per area

export const areaUndoStacks = pgTable(
  "area_undo_stacks",

  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),

    areaId: integer("area_id").notNull(),

    undoStack: jsonb("undo_stack").notNull().default([]), // Array of ChangeKey objects that can be undone

    redoStack: jsonb("redo_stack").notNull().default([]), // Array of ChangeKey objects that can be redone

    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()

      .notNull(),
  },

  (table) => [
    index("idx_area_undo_stacks_area_id").using(
      "btree",

      table.areaId.asc().nullsLast().op("int4_ops")
    ),

    unique("area_undo_stacks_area_id_unique").on(table.areaId),
  ]
);

/** Layer structure template — saves a set of named/colored layers for reuse across areas */
export const layerTemplates = pgTable(
  "layer_templates",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    /** JSON array of { name, color, opacity, orderIndex, notes } objects */
    layers: jsonb("layers").notNull().$type<
      Array<{
        name: string;
        color: string;
        opacity: number;
        orderIndex: number;
        notes?: string | null;
      }>
    >(),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_layer_templates_name").using(
      "btree",
      table.name.asc().nullsLast()
    ),
  ]
);

// Type definitions for all tables

export type SelectPerformanceMetrics = typeof performanceMetrics.$inferSelect;

export type InsertPerformanceMetrics = typeof performanceMetrics.$inferInsert;

export type SelectApiCache = typeof apiCache.$inferSelect;

export type InsertApiCache = typeof apiCache.$inferInsert;

export type SelectErrorLogs = typeof errorLogs.$inferSelect;

export type InsertErrorLogs = typeof errorLogs.$inferInsert;

export type SelectPostalCodes = typeof postalCodes.$inferSelect;

export type InsertPostalCodes = typeof postalCodes.$inferInsert;

export type SelectStates = typeof states.$inferSelect;

export type InsertStates = typeof states.$inferInsert;

export type SelectCountryShapes = typeof countryShapes.$inferSelect;

export type InsertCountryShapes = typeof countryShapes.$inferInsert;

export type SelectAreas = typeof areas.$inferSelect;

export type InsertAreas = typeof areas.$inferInsert;

export type SelectAreaVersions = typeof areaVersions.$inferSelect;

export type InsertAreaVersions = typeof areaVersions.$inferInsert;

/** Lightweight version summary — excludes the heavy `snapshot` JSONB column */
export interface VersionSummary {
  areaId: number;
  versionNumber: number;
  name: string | null;
  description: string | null;
  isActive: string;
  changeCount: number;
  branchName: string | null;
  createdBy: string | null;
  createdAt: string;
  layerCount: number;
}

export type SelectAreaLayers = typeof areaLayers.$inferSelect;

export type InsertAreaLayers = typeof areaLayers.$inferInsert;

export type SelectAreaLayerPostalCodes =
  typeof areaLayerPostalCodes.$inferSelect;

export type InsertAreaLayerPostalCodes =
  typeof areaLayerPostalCodes.$inferInsert;

export type SelectAreaChanges = typeof areaChanges.$inferSelect;

export type InsertAreaChanges = typeof areaChanges.$inferInsert;

/** Lightweight change summary — excludes the heavy changeData/previousData JSONB columns */
export interface ChangeSummary {
  areaId: number;
  versionAreaId: number | null;
  versionNumber: number | null;
  sequenceNumber: number;
  changeType: string;
  entityType: string;
  entityId: number | null;
  isUndone: string;
  createdBy: string | null;
  createdAt: string;
  postalCodeCount: number;
  layerName: string | null;
  previousLayerName: string | null;
}

export type SelectAreaUndoStacks = typeof areaUndoStacks.$inferSelect;

export type InsertAreaUndoStacks = typeof areaUndoStacks.$inferInsert;

export type SelectLayerTemplates = typeof layerTemplates.$inferSelect;

export type InsertLayerTemplates = typeof layerTemplates.$inferInsert;

// ─── Area Tags ───────────────────────────────────────────────────────────────

export const areaTags = pgTable(
  "area_tags",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity().notNull(),
    name: varchar({ length: 50 }).notNull(),
    color: varchar({ length: 20 }).notNull().default("#3b82f6"),
    createdAt: timestamp("created_at", { mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_area_tags_name").on(table.name)]
);

export const areaTagAssignments = pgTable(
  "area_tag_assignments",
  {
    areaId: integer("area_id").notNull(),
    tagId: integer("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.areaId, table.tagId] }),
    index("idx_area_tag_assignments_area_id").on(table.areaId),
    index("idx_area_tag_assignments_tag_id").on(table.tagId),
  ]
);

export type SelectAreaTag = typeof areaTags.$inferSelect;
export type InsertAreaTag = typeof areaTags.$inferInsert;
export type SelectAreaTagAssignment = typeof areaTagAssignments.$inferSelect;
