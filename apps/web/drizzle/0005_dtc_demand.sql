CREATE TABLE "dtc_demand" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"make" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dtc_demand_uq" ON "dtc_demand" USING btree ("code","make");--> statement-breakpoint
CREATE INDEX "dtc_demand_count_idx" ON "dtc_demand" USING btree ("count");