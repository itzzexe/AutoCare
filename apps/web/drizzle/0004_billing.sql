CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_order_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"base_minor" integer NOT NULL,
	"rate_bps" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'accrued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_rate_range" CHECK ("commission_entries"."rate_bps" >= 0 and "commission_entries"."rate_bps" <= 3000)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"tier" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"description_ar" text NOT NULL,
	"description_en" text NOT NULL,
	"price_minor" integer,
	"currency" text DEFAULT 'IQD' NOT NULL,
	"period_days" integer DEFAULT 30 NOT NULL,
	"entitlements" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"activated_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subs_amount_nonneg" CHECK ("subscriptions"."amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_merchant_order_id_merchant_orders_id_fk" FOREIGN KEY ("merchant_order_id") REFERENCES "public"."merchant_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_morder_uq" ON "commission_entries" USING btree ("merchant_order_id");--> statement-breakpoint
CREATE INDEX "commission_merchant_idx" ON "commission_entries" USING btree ("merchant_id","status");--> statement-breakpoint
CREATE INDEX "subs_subject_idx" ON "subscriptions" USING btree ("subject_kind","subject_id","status");--> statement-breakpoint
CREATE INDEX "subs_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subs_provider_ref_uq" ON "subscriptions" USING btree ("provider","provider_ref");