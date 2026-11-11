import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, encrypted, pk, ts, updatedAt } from "./common";
import { vehicles } from "./diagnostics";
import { users } from "./identity";
import { sourceRecords } from "./knowledge";

export const merchants = pgTable(
  "merchants",
  {
    id: pk(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    governorate: text("governorate").notNull(),
    city: text("city").notNull(),
    phoneEnc: encrypted("phone_enc").notNull(),
    description: text("description"),
    status: text("status", { enum: ["pending", "approved", "suspended", "rejected"] }).notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: ts("reviewed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("merchants_status_idx").on(t.status, t.governorate)],
);

export const merchantMembers = pgTable(
  "merchant_members",
  {
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "staff"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.userId] })],
);

export const products = pgTable(
  "products",
  {
    id: pk(),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    titleAr: text("title_ar").notNull(),
    titleEn: text("title_en"),
    brand: text("brand").notNull(),
    category: text("category").notNull(),
    /** OE/OEM numbers as the seller wrote them (display). */
    oeNumbers: jsonb("oe_numbers").$type<string[]>().notNull().default([]),
    /** Normalised OE/OEM keys (identifierKey) for exact matching. */
    oeKeys: jsonb("oe_keys").$type<string[]>().notNull().default([]),
    condition: text("condition", { enum: ["new", "used", "refurbished"] }).notNull(),
    /** What the seller claims. */
    authenticityClaim: text("authenticity_claim", { enum: ["oem_genuine", "oem_equivalent", "aftermarket", "unknown"] }).notNull(),
    /** Set only by a moderator after reviewing evidence. */
    authenticityVerifiedAt: ts("authenticity_verified_at"),
    authenticityVerifiedBy: uuid("authenticity_verified_by").references(() => users.id),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    stockQty: integer("stock_qty").notNull(),
    warrantyDays: integer("warranty_days").notNull().default(0),
    returnDays: integer("return_days").notNull().default(0),
    deliveryOptions: jsonb("delivery_options").$type<Array<"pickup" | "delivery">>().notNull(),
    imageIds: jsonb("image_ids").$type<string[]>().notNull().default([]),
    /** Paid placement; always labelled to the user and never mixed into technical recommendations. */
    sponsored: boolean("sponsored").notNull().default(false),
    status: text("status", { enum: ["draft", "active", "hidden", "removed"] }).notNull().default("active"),
    searchKey: text("search_key").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_merchant_idx").on(t.merchantId),
    check("products_stock_nonneg", sql`${t.stockQty} >= 0`),
    check("products_price_nonneg", sql`${t.priceMinor} >= 0`),
  ],
);

export const partFitments = pgTable(
  "part_fitments",
  {
    id: pk(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    make: text("make").notNull(),
    model: text("model").notNull(),
    yearFrom: integer("year_from").notNull(),
    yearTo: integer("year_to").notNull(),
    engine: text("engine"),
    market: text("market"),
    /** provider = licensed fitment catalog; merchant_claim = seller said so; moderator_verified = checked. */
    source: text("source", { enum: ["provider", "merchant_claim", "moderator_verified"] }).notNull(),
    sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id),
  },
  (t) => [index("fitment_lookup_idx").on(t.make, t.model)],
);

export const offerRequests = pgTable(
  "offer_requests",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
    /** Snapshot shared with merchants: make/model/year/engine only — no VIN, no owner identity. */
    vehicleSnapshot: jsonb("vehicle_snapshot").$type<Record<string, unknown>>().notNull(),
    partDescription: text("part_description").notNull(),
    oeNumber: text("oe_number"),
    quantity: integer("quantity").notNull(),
    governorate: text("governorate").notNull(),
    status: text("status", { enum: ["open", "closed", "expired"] }).notNull().default("open"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("oreq_gov_idx").on(t.governorate, t.status)],
);

export const offers = pgTable(
  "offers",
  {
    id: pk(),
    offerRequestId: uuid("offer_request_id").notNull().references(() => offerRequests.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    condition: text("condition", { enum: ["new", "used", "refurbished"] }).notNull(),
    warrantyDays: integer("warranty_days").notNull(),
    deliveryFeeMinor: integer("delivery_fee_minor").notNull().default(0),
    etaDays: integer("eta_days").notNull(),
    notes: text("notes"),
    status: text("status", { enum: ["submitted", "withdrawn", "accepted", "rejected", "expired"] }).notNull().default("submitted"),
    validUntil: ts("valid_until").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("offers_one_per_merchant").on(t.offerRequestId, t.merchantId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    offerId: uuid("offer_id").references(() => offers.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("cart_user_idx").on(t.userId), check("cart_qty_pos", sql`${t.quantity} > 0`)],
);

export const orders = pgTable(
  "orders",
  {
    id: pk(),
    userId: uuid("user_id").notNull().references(() => users.id),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status", { enum: ["placed", "partially_fulfilled", "fulfilled", "cancelled"] }).notNull().default("placed"),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull(),
    paymentMethod: text("payment_method", { enum: ["cod", "qi_card", "zaincash", "test_gateway"] }).notNull(),
    fulfilment: text("fulfilment", { enum: ["pickup", "delivery"] }).notNull(),
    governorate: text("governorate"),
    /** Delivery address (name, phone, street) encrypted as one envelope. */
    addressEnc: encrypted("address_enc"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("orders_idem_uq").on(t.userId, t.idempotencyKey)],
);

export const merchantOrders = pgTable(
  "merchant_orders",
  {
    id: pk(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    merchantId: uuid("merchant_id").notNull().references(() => merchants.id),
    status: text("status", { enum: ["pending", "confirmed", "shipped", "delivered", "cancelled", "return_requested", "returned"] }).notNull().default("pending"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    deliveryFeeMinor: integer("delivery_fee_minor").notNull().default(0),
    currency: text("currency").notNull(),
    statusHistory: jsonb("status_history").$type<Array<{ status: string; at: string; by: string; note?: string }>>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("morders_merchant_idx").on(t.merchantId, t.status), index("morders_order_idx").on(t.orderId)],
);

export const orderItems = pgTable("order_items", {
  id: pk(),
  merchantOrderId: uuid("merchant_order_id").notNull().references(() => merchantOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  offerId: uuid("offer_id").references(() => offers.id, { onDelete: "set null" }),
  titleSnapshot: text("title_snapshot").notNull(),
  unitPriceMinor: integer("unit_price_minor").notNull(),
  quantity: integer("quantity").notNull(),
});

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: pk(),
    productId: uuid("product_id").notNull().references(() => products.id),
    merchantOrderId: uuid("merchant_order_id").notNull().references(() => merchantOrders.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    status: text("status", { enum: ["held", "committed", "released"] }).notNull().default("held"),
    createdAt: createdAt(),
  },
  (t) => [index("ires_product_idx").on(t.productId)],
);

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["cod", "qi_card", "zaincash", "test_gateway"] }).notNull(),
    status: text("status", { enum: ["pending", "authorized", "paid", "failed", "refunded"] }).notNull().default("pending"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    providerRef: text("provider_ref"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("payments_provider_ref_uq").on(t.provider, t.providerRef)],
);

/** Processed webhook event ids, for idempotent handling. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: pk(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    receivedAt: createdAt(),
    outcome: text("outcome").notNull(),
  },
  (t) => [uniqueIndex("webhook_event_uq").on(t.provider, t.eventId)],
);

export const returnRequests = pgTable("return_requests", {
  id: pk(),
  merchantOrderId: uuid("merchant_order_id").notNull().references(() => merchantOrders.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["requested", "approved", "rejected", "received", "refunded"] }).notNull().default("requested"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Reviews must reference a real delivered order or completed appointment. */
export const reviews = pgTable(
  "reviews",
  {
    id: pk(),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    targetKind: text("target_kind", { enum: ["merchant", "workshop"] }).notNull(),
    targetId: uuid("target_id").notNull(),
    proofKind: text("proof_kind", { enum: ["merchant_order", "appointment"] }).notNull(),
    proofId: uuid("proof_id").notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull().default(""),
    status: text("status", { enum: ["published", "flagged", "hidden"] }).notNull().default("published"),
    flagCount: integer("flag_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reviews_one_per_proof").on(t.authorId, t.proofKind, t.proofId),
    index("reviews_target_idx").on(t.targetKind, t.targetId, t.status),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
  ],
);
