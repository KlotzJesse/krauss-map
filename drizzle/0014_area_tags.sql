CREATE TABLE "area_tags" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "area_tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(50) NOT NULL,
	"color" varchar(20) NOT NULL DEFAULT '#3b82f6',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_area_tags_name" ON "area_tags" USING btree ("name");
--> statement-breakpoint
CREATE TABLE "area_tag_assignments" (
	"area_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "area_tag_assignments_pkey" PRIMARY KEY("area_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "area_tag_assignments" ADD CONSTRAINT "area_tag_assignments_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "area_tag_assignments" ADD CONSTRAINT "area_tag_assignments_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."area_tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX "idx_area_tag_assignments_area_id" ON "area_tag_assignments" USING btree ("area_id");
--> statement-breakpoint
CREATE INDEX "idx_area_tag_assignments_tag_id" ON "area_tag_assignments" USING btree ("tag_id");
