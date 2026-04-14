ALTER TABLE "states" DROP CONSTRAINT "states_code_unique";--> statement-breakpoint
ALTER TABLE "area_layer_postal_codes" ADD COLUMN "postal_code_id" integer;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "country" varchar(2) DEFAULT 'DE' NOT NULL;--> statement-breakpoint
ALTER TABLE "postal_codes" ADD COLUMN "country" varchar(2) DEFAULT 'DE' NOT NULL;--> statement-breakpoint
ALTER TABLE "postal_codes" ADD COLUMN "is_active" varchar(5) DEFAULT 'true' NOT NULL;--> statement-breakpoint
ALTER TABLE "postal_codes" ADD COLUMN "source_release" varchar(50);--> statement-breakpoint
ALTER TABLE "states" ADD COLUMN "country" varchar(2) DEFAULT 'DE' NOT NULL;--> statement-breakpoint
ALTER TABLE "area_layer_postal_codes" ADD CONSTRAINT "fk_area_layer_postal_codes_postal_code_id" FOREIGN KEY ("postal_code_id") REFERENCES "public"."postal_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_areas_country" ON "areas" USING btree ("country" text_ops);--> statement-breakpoint
CREATE INDEX "idx_postal_codes_country" ON "postal_codes" USING btree ("country" text_ops);--> statement-breakpoint
CREATE INDEX "idx_postal_codes_country_granularity" ON "postal_codes" USING btree ("country" text_ops,"granularity" text_ops);--> statement-breakpoint
CREATE INDEX "idx_states_country" ON "states" USING btree ("country" text_ops);--> statement-breakpoint
ALTER TABLE "postal_codes" ADD CONSTRAINT "postal_codes_country_granularity_code_unique" UNIQUE("country","granularity","code");--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_code_unique" UNIQUE("country","code");