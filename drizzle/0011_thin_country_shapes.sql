CREATE TABLE IF NOT EXISTS "country_shapes" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  "country" varchar(2) NOT NULL,
  "name" varchar(255) NOT NULL,
  "iso3" varchar(3),
  "is_active" varchar(5) DEFAULT 'true' NOT NULL,
  "source_release" varchar(50),
  "geometry" geometry(MultiPolygon, 4326) NOT NULL,
  "properties" jsonb,
  "bbox" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "country_shapes_country_unique" UNIQUE("country")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_country_shapes_country" ON "country_shapes" USING btree ("country" text_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_country_shapes_geometry" ON "country_shapes" USING gist ("geometry" gist_geometry_ops_2d);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_country_shapes_is_active" ON "country_shapes" USING btree ("is_active" text_ops);