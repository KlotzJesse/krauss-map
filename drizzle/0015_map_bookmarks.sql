CREATE TABLE "map_bookmarks" (
"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "map_bookmarks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
"name" varchar(80) NOT NULL,
"longitude" varchar(30) NOT NULL,
"latitude" varchar(30) NOT NULL,
"zoom" varchar(10) NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_map_bookmarks_created_at" ON "map_bookmarks" USING btree ("created_at");
