CREATE TABLE "fault_guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"category" text NOT NULL,
	"title_ar" text NOT NULL,
	"title_en" text NOT NULL,
	"summary_ar" text NOT NULL,
	"summary_en" text NOT NULL,
	"symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety_area" text DEFAULT 'none' NOT NULL,
	"urgency" text NOT NULL,
	"related_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_record_id" uuid NOT NULL,
	"version" text NOT NULL,
	"review_status" text DEFAULT 'draft' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dtc_definitions" ADD COLUMN "fixes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fault_guides" ADD CONSTRAINT "fault_guides_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fault_guides_slug_uq" ON "fault_guides" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "fault_guides_tsv_idx" ON "fault_guides" USING gin ("search_tsv");--> statement-breakpoint
CREATE INDEX "fault_guides_cat_idx" ON "fault_guides" USING btree ("category");