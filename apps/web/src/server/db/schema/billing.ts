import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, pk, ts, updatedAt } from "./common";
import { users } from "./identity";
import { merchantOrders, merchants } from "./market";

/**
 * Revenue model (docs/MONETIZATION.md):
 *  - plans/subscriptions for owners (Pro), workshops and merchants (featured placement, lower commission)
 *  - a commission ledger on delivered marketplace orders
 * Safety information, code meanings and the deterministic urgency verdict are
 * never behind a plan. Prices are set by the operator in the admin panel; a
 * plan is not shown publicly until it has a price and is published.
 */

export interface PlanEntitlements {
  /** Owner plans */
  maxVehicles?: number;
  aiExplanationsPerMonth?: number;
  /** Business plans */
  featuredListing?: boolean;
  sponsoredProducts?: number;
  commissionBps?: number;
  offerResponsesPerMonth?: number;
  analytics?: boolean;
}

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  audience: text("audience", { enum: ["owner", "workshop", "merchant"] }).notNull(),
  tier: text("tier", { enum: ["free", "paid"] }).notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionAr: text("description_ar").notNull(),
  descriptionEn: text("description_en").notNull(),
  /** Minor units (IQD has no minor unit in practice: 1 = 1 IQD). Null until the operator sets it. */
  priceMinor: integer("price_minor"),
  currency: text("currency").notNull().default("IQD"),
  periodDays: integer("period_days").notNull().default(30),
  entitlements: jsonb("entitlements").$type<PlanEntitlements>().notNull(),
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: pk(),
    planId: text("plan_id").notNull().references(() => plans.id),
    /** Who the plan applies to: the user (owner plans) or a business. */
    subjectKind: text("subject_kind", { enum: ["user", "workshop", "merchant"] }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** The person who bought it. */
    userId: uuid("user_id").notNull().references(() => users.id),
    status: text("status", { enum: ["pending_payment", "pending_manual", "active", "expired", "cancelled", "failed"] }).notNull(),
    /** Payment rail: an online gateway, or "manual" (cash/transfer confirmed by an admin). */
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    periodStart: ts("period_start"),
    periodEnd: ts("period_end"),
    activatedBy: uuid("activated_by").references(() => users.id),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("subs_subject_idx").on(t.subjectKind, t.subjectId, t.status),
    index("subs_user_idx").on(t.userId),
    uniqueIndex("subs_provider_ref_uq").on(t.provider, t.providerRef),
    check("subs_amount_nonneg", sql`${t.amountMinor} >= 0`),
  ],
);

/** One commission line per delivered merchant order; rate frozen at accrual time. */
export const commissionEntries = pgTable(
  "commission_entries",
  {
    id: pk(),
    merchantOrderId: uuid("merchant_order_id").notNull().references(() => merchantOrders.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    baseMinor: integer("base_minor").notNull(),
    rateBps: integer("rate_bps").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["accrued", "invoiced", "settled", "void"] }).notNull().default("accrued"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("commission_morder_uq").on(t.merchantOrderId),
    index("commission_merchant_idx").on(t.merchantId, t.status),
    check("commission_rate_range", sql`${t.rateBps} >= 0 and ${t.rateBps} <= 3000`),
  ],
);
