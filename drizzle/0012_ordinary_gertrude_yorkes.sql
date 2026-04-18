CREATE TABLE "country_shapes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "country_shapes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
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
ALTER TABLE "area_layers" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE INDEX "idx_country_shapes_country" ON "country_shapes" USING btree ("country" text_ops);--> statement-breakpoint
CREATE INDEX "idx_country_shapes_geometry" ON "country_shapes" USING gist ("geometry" gist_geometry_ops_2d);--> statement-breakpoint
CREATE INDEX "idx_country_shapes_is_active" ON "country_shapes" USING btree ("is_active" text_ops);