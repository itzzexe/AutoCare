ALTER TABLE "products" ADD COLUMN "oe_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Backfill: existing rows stored normalised numbers in oe_numbers; keep them matchable.
UPDATE "products" SET "oe_keys" = "oe_numbers" WHERE "oe_keys" = '[]'::jsonb;
