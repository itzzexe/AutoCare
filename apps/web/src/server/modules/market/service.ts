import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { identifierKey, searchKey, type CheckoutInput, type MerchantApplyInput, type OfferInput, type OfferRequestInput, type ProductInput } from "@autocare/contracts";
import type { z } from "zod";
import { getDb, type Tx } from "../../db/client";
import {
  cartItems, inventoryReservations, merchantMembers, merchantOrders, merchants, notifications, offerRequests, offers, orderItems, orders,
  partFitments, payments, products, returnRequests, reviews, userRoles, webhookEvents,
} from "../../db/schema";
import { decryptField, encryptField, hmacB64u, safeEqual, sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { audit } from "../audit/audit";
import { accrueCommission, activePaidSubjects, entitlementsFor, voidCommission } from "../billing/service";
import { GATEWAYS } from "../payments/gateways";
import { env } from "../../config/env";
import { revokeAllSessions } from "../identity/sessions";
import { getOwnedVehicle, vehicleSnapshot } from "../vehicles/service";

type Product = typeof products.$inferSelect;
type MerchantOrderStatus = (typeof merchantOrders.$inferSelect)["status"];

async function notify(tx: Tx, userIds: string[], kind: string, titleAr: string, titleEn: string, link: string) {
  if (!userIds.length) return;
  await tx.insert(notifications).values(userIds.map((userId) => ({ userId, kind, titleAr, titleEn, link })));
}

async function merchantUserIds(tx: Tx, merchantId: string) {
  return (await tx.select({ u: merchantMembers.userId }).from(merchantMembers).where(eq(merchantMembers.merchantId, merchantId))).map((r) => r.u);
}

// ---------------- merchants ----------------

export async function applyMerchant(userId: string, input: z.output<typeof MerchantApplyInput>, requestId?: string) {
  const db = await getDb();
  const existing = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.ownerUserId, userId)).limit(1);
  if (existing[0]) throw new AppError("conflict", "already_applied");
  return db.transaction(async (tx) => {
    const id = crypto.randomUUID();
    const [m] = await tx
      .insert(merchants)
      .values({ id, ownerUserId: userId, name: input.name, governorate: input.governorate, city: input.city, phoneEnc: encryptField(input.phone, `merchant:${id}:phone`), description: input.description })
      .returning();
    await tx.insert(merchantMembers).values({ merchantId: id, userId, role: "owner" });
    await audit({ action: "merchant.applied", actorUserId: userId, targetKind: "merchant", targetId: id, requestId }, tx);
    return m!;
  });
}

/** The merchant the user operates, or forbidden. Membership + approval checked server-side. */
export async function merchantOf(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ m: merchants })
    .from(merchantMembers)
    .innerJoin(merchants, eq(merchants.id, merchantMembers.merchantId))
    .where(eq(merchantMembers.userId, userId))
    .limit(1);
  return row?.m ?? null;
}

export async function approvedMerchantOf(userId: string) {
  const m = await merchantOf(userId);
  if (!m) throw new AppError("forbidden", "not_a_merchant_member");
  if (m.status !== "approved") throw new AppError("forbidden", "merchant_not_approved");
  return m;
}

export async function moderateMerchant(moderatorId: string, merchantId: string, status: "approved" | "suspended" | "rejected", requestId?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [m] = await tx.update(merchants).set({ status, reviewedBy: moderatorId, reviewedAt: new Date() }).where(eq(merchants.id, merchantId)).returning();
    if (!m) throw new AppError("not_found");
    if (status === "approved") {
      await tx.insert(userRoles).values({ userId: m.ownerUserId, roleId: "merchant", grantedBy: moderatorId }).onConflictDoNothing();
    } else {
      await tx.delete(userRoles).where(and(eq(userRoles.userId, m.ownerUserId), eq(userRoles.roleId, "merchant")));
      await tx.update(products).set({ status: "hidden" }).where(eq(products.merchantId, merchantId));
    }
    // Privilege change: force re-login so the new role set takes effect in a fresh session.
    await revokeAllSessions(m.ownerUserId, `merchant_${status}`, undefined, tx);
    await notify(tx, [m.ownerUserId], "merchant_status", `حالة حساب التاجر: ${status}`, `Merchant account: ${status}`, "/merchant");
    await audit({ action: "merchant.status_changed", actorUserId: moderatorId, targetKind: "merchant", targetId: merchantId, requestId, meta: { status } }, tx);
  });
}

export async function listMerchantsForModeration() {
  const db = await getDb();
  const rows = await db.select().from(merchants).orderBy(desc(merchants.createdAt)).limit(100);
  return rows.map(({ phoneEnc: _p, ...m }) => m);
}

// ---------------- products ----------------

export async function upsertProduct(userId: string, input: z.output<typeof ProductInput>, productId?: string, requestId?: string) {
  const m = await approvedMerchantOf(userId);
  const db = await getDb();
  const values = {
    merchantId: m.id,
    titleAr: input.titleAr,
    titleEn: input.titleEn ?? null,
    brand: input.brand,
    category: input.category,
    oeNumbers: [...new Set(input.oeNumbers.map((o) => o.trim().toUpperCase()))],
    oeKeys: [...new Set(input.oeNumbers.map(identifierKey))],
    condition: input.condition,
    authenticityClaim: input.authenticityClaim,
    priceMinor: input.priceMinor,
    currency: input.currency,
    stockQty: input.stockQty,
    warrantyDays: input.warrantyDays,
    returnDays: input.returnDays,
    deliveryOptions: input.deliveryOptions,
    imageIds: input.imageIds,
    searchKey: searchKey([input.titleAr, input.titleEn, input.brand, input.category, ...input.oeNumbers].filter(Boolean).join(" ")),
    updatedAt: new Date(),
  };
  return db.transaction(async (tx) => {
    let id = productId;
    if (id) {
      // Merchant id in the WHERE clause: another merchant's product is simply not found.
      const [p] = await tx
        .update(products)
        .set({ ...values, authenticityVerifiedAt: null, authenticityVerifiedBy: null })
        .where(and(eq(products.id, id), eq(products.merchantId, m.id)))
        .returning({ id: products.id });
      if (!p) throw new AppError("not_found");
      await tx.delete(partFitments).where(and(eq(partFitments.productId, id), eq(partFitments.source, "merchant_claim")));
    } else {
      const [p] = await tx.insert(products).values(values).returning({ id: products.id });
      id = p!.id;
    }
    if (input.fitments.length) {
      await tx.insert(partFitments).values(input.fitments.map((f) => ({ productId: id!, make: f.make, model: f.model, yearFrom: Math.min(f.yearFrom, f.yearTo), yearTo: Math.max(f.yearFrom, f.yearTo), engine: f.engine ?? null, market: f.market ?? null, source: "merchant_claim" as const })));
    }
    await audit({ action: "product.changed", actorUserId: userId, targetKind: "product", targetId: id, requestId }, tx);
    return { id: id! };
  });
}

export async function myProducts(userId: string) {
  const m = await approvedMerchantOf(userId);
  const db = await getDb();
  return db.select().from(products).where(eq(products.merchantId, m.id)).orderBy(desc(products.updatedAt)).limit(200);
}

export async function verifyAuthenticity(moderatorId: string, productId: string, requestId?: string) {
  const db = await getDb();
  const [p] = await db.update(products).set({ authenticityVerifiedAt: new Date(), authenticityVerifiedBy: moderatorId }).where(eq(products.id, productId)).returning({ id: products.id });
  if (!p) throw new AppError("not_found");
  await audit({ action: "product.authenticity_verified", actorUserId: moderatorId, targetKind: "product", targetId: productId, requestId });
}

export type FitmentLabel = "compatible_per_source" | "seller_claim" | "needs_confirmation";

export interface CatalogItem {
  id: string;
  titleAr: string;
  titleEn: string | null;
  brand: string;
  category: string;
  oeNumbers: string[];
  condition: string;
  authenticityClaim: string;
  authenticityVerified: boolean;
  priceMinor: number;
  currency: string;
  inStock: boolean;
  warrantyDays: number;
  returnDays: number;
  deliveryOptions: string[];
  sponsored: boolean;
  merchant: { id: string; name: string; governorate: string };
  fitment: FitmentLabel;
}

/**
 * Fitment evidence ladder. Only a licensed catalogue match or a moderator
 * verification yields "compatible_per_source". A seller's own claim is shown as
 * such. Textual similarity never produces a compatibility label.
 */
function fitmentLabel(fits: Array<typeof partFitments.$inferSelect>, v?: { make: string; model: string; year: number; engine: string | null }): FitmentLabel {
  if (!v) return "needs_confirmation";
  const match = fits.filter(
    (f) => f.make.toLowerCase() === v.make.toLowerCase() && f.model.toLowerCase() === v.model.toLowerCase() && v.year >= f.yearFrom && v.year <= f.yearTo && (!f.engine || !v.engine || v.engine.toLowerCase().includes(f.engine.toLowerCase())),
  );
  if (match.some((f) => f.source === "provider" || f.source === "moderator_verified")) return "compatible_per_source";
  if (match.some((f) => f.source === "merchant_claim")) return "seller_claim";
  return "needs_confirmation";
}

function toCatalog(p: Product, m: typeof merchants.$inferSelect, fits: Array<typeof partFitments.$inferSelect>, v?: { make: string; model: string; year: number; engine: string | null }): CatalogItem {
  return {
    id: p.id, titleAr: p.titleAr, titleEn: p.titleEn, brand: p.brand, category: p.category, oeNumbers: p.oeNumbers, condition: p.condition,
    authenticityClaim: p.authenticityClaim, authenticityVerified: Boolean(p.authenticityVerifiedAt), priceMinor: p.priceMinor, currency: p.currency,
    inStock: p.stockQty > 0, warrantyDays: p.warrantyDays, returnDays: p.returnDays, deliveryOptions: p.deliveryOptions, sponsored: p.sponsored,
    merchant: { id: m.id, name: m.name, governorate: m.governorate }, fitment: fitmentLabel(fits, v),
  };
}

export async function searchCatalog(params: { q?: string; vehicle?: { make: string; model: string; year: number; engine: string | null }; governorate?: string; limit: number }) {
  const db = await getDb();
  const conds = [eq(products.status, "active"), eq(merchants.status, "approved")];
  if (params.q) {
    const oe = identifierKey(params.q);
    const key = searchKey(params.q);
    const like = `%${key.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    conds.push(sql`(${products.searchKey} like ${like} or ${products.oeKeys} @> ${JSON.stringify([oe])}::jsonb)`);
  }
  if (params.governorate) conds.push(eq(merchants.governorate, params.governorate));
  const rows = await db
    .select({ p: products, m: merchants })
    .from(products)
    .innerJoin(merchants, eq(merchants.id, products.merchantId))
    .where(and(...conds))
    // Sponsored items are labelled, and never re-ordered above organic results by this query.
    .orderBy(desc(products.updatedAt))
    .limit(params.limit);
  const fits = rows.length ? await db.select().from(partFitments).where(inArray(partFitments.productId, rows.map((r) => r.p.id))) : [];
  const paying = await activePaidSubjects("merchant", [...new Set(rows.filter((r) => r.p.sponsored).map((r) => r.m.id))], "sponsoredProducts");
  // The label follows the money: "sponsored" shows only while the merchant's paid plan is active.
  return rows.map((r) => toCatalog({ ...r.p, sponsored: r.p.sponsored && paying.has(r.m.id) }, r.m, fits.filter((f) => f.productId === r.p.id), params.vehicle));
}

/**
 * Paid placements for the catalog page: a separate, labelled block (max 3)
 * that never changes the order or content of the organic results.
 */
export async function sponsoredForCatalog(params: { q?: string; vehicle?: { make: string; model: string; year: number; engine: string | null }; governorate?: string }) {
  const db = await getDb();
  const conds = [eq(products.status, "active"), eq(merchants.status, "approved"), eq(products.sponsored, true), sql`${products.stockQty} > 0`];
  if (params.q) {
    const oe = identifierKey(params.q);
    const like = `%${searchKey(params.q).replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    conds.push(sql`(${products.searchKey} like ${like} or ${products.oeKeys} @> ${JSON.stringify([oe])}::jsonb)`);
  }
  if (params.governorate) conds.push(eq(merchants.governorate, params.governorate));
  const rows = await db.select({ p: products, m: merchants }).from(products).innerJoin(merchants, eq(merchants.id, products.merchantId)).where(and(...conds)).orderBy(sql`random()`).limit(12);
  const paying = await activePaidSubjects("merchant", [...new Set(rows.map((r) => r.m.id))], "sponsoredProducts");
  const picked = rows.filter((r) => paying.has(r.m.id)).slice(0, 3);
  const fits = picked.length ? await db.select().from(partFitments).where(inArray(partFitments.productId, picked.map((r) => r.p.id))) : [];
  return picked.map((r) => toCatalog(r.p, r.m, fits.filter((f) => f.productId === r.p.id), params.vehicle));
}

/** Merchant marks a product as sponsored, within the plan's allowance. */
export async function setProductSponsored(userId: string, productId: string, sponsored: boolean, requestId?: string) {
  const m = await approvedMerchantOf(userId);
  const db = await getDb();
  if (sponsored) {
    const ent = await entitlementsFor("merchant", m.id);
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.merchantId, m.id), eq(products.sponsored, true), sql`${products.id} <> ${productId}`))) as [{ n: number }];
    if (n >= (ent.sponsoredProducts ?? 0)) throw new AppError("plan_limit", "sponsored_allowance");
  }
  const [p] = await db.update(products).set({ sponsored, updatedAt: new Date() }).where(and(eq(products.id, productId), eq(products.merchantId, m.id))).returning({ id: products.id });
  if (!p) throw new AppError("not_found");
  await audit({ action: "product.changed", actorUserId: userId, targetKind: "product", targetId: productId, requestId, meta: { sponsored } });
  return { id: p.id, sponsored };
}

export async function productDetail(productId: string, vehicle?: { make: string; model: string; year: number; engine: string | null }) {
  const db = await getDb();
  const [r] = await db.select({ p: products, m: merchants }).from(products).innerJoin(merchants, eq(merchants.id, products.merchantId)).where(and(eq(products.id, productId), eq(products.status, "active"), eq(merchants.status, "approved"))).limit(1);
  if (!r) throw new AppError("not_found");
  const fits = await db.select().from(partFitments).where(eq(partFitments.productId, productId));
  return { ...toCatalog(r.p, r.m, fits, vehicle), fitments: fits.map((f) => ({ make: f.make, model: f.model, yearFrom: f.yearFrom, yearTo: f.yearTo, engine: f.engine, market: f.market, source: f.source })) };
}

// ---------------- offer requests (RFQ) ----------------

export async function createOfferRequest(userId: string, input: z.output<typeof OfferRequestInput>) {
  const v = await getOwnedVehicle(userId, input.vehicleId);
  const db = await getDb();
  const [r] = await db
    .insert(offerRequests)
    .values({ userId, vehicleId: v.id, vehicleSnapshot: vehicleSnapshot(v), partDescription: input.partDescription, oeNumber: input.oeNumber ? identifierKey(input.oeNumber) : null, quantity: input.quantity, governorate: input.governorate, expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000) })
    .returning();
  return r!;
}

export async function myOfferRequests(userId: string) {
  const db = await getDb();
  const reqs = await db.select().from(offerRequests).where(eq(offerRequests.userId, userId)).orderBy(desc(offerRequests.createdAt)).limit(50);
  const offs = reqs.length
    ? await db.select({ o: offers, merchantName: merchants.name }).from(offers).innerJoin(merchants, eq(merchants.id, offers.merchantId)).where(inArray(offers.offerRequestId, reqs.map((r) => r.id)))
    : [];
  return reqs.map((r) => ({ ...r, offers: offs.filter((o) => o.o.offerRequestId === r.id).map((o) => ({ ...o.o, merchantName: o.merchantName })).sort((a, b) => a.priceMinor + a.deliveryFeeMinor - (b.priceMinor + b.deliveryFeeMinor)) }));
}

/** Merchant view: anonymous request data only (no user id, no vehicle id, no VIN). */
export async function openRequestsForMerchant(userId: string) {
  const m = await approvedMerchantOf(userId);
  const db = await getDb();
  const rows = await db
    .select({ id: offerRequests.id, vehicle: offerRequests.vehicleSnapshot, partDescription: offerRequests.partDescription, oeNumber: offerRequests.oeNumber, quantity: offerRequests.quantity, governorate: offerRequests.governorate, expiresAt: offerRequests.expiresAt, createdAt: offerRequests.createdAt })
    .from(offerRequests)
    .where(and(eq(offerRequests.status, "open"), eq(offerRequests.governorate, m.governorate), gt(offerRequests.expiresAt, new Date())))
    .orderBy(desc(offerRequests.createdAt))
    .limit(100);
  const mine = rows.length ? await db.select({ rid: offers.offerRequestId, status: offers.status, priceMinor: offers.priceMinor }).from(offers).where(and(eq(offers.merchantId, m.id), inArray(offers.offerRequestId, rows.map((r) => r.id)))) : [];
  return rows.map((r) => ({ ...r, myOffer: mine.find((o) => o.rid === r.id) ?? null }));
}

export async function submitOffer(userId: string, requestId: string, input: z.output<typeof OfferInput>) {
  const m = await approvedMerchantOf(userId);
  const db = await getDb();
  const [req] = await db.select().from(offerRequests).where(and(eq(offerRequests.id, requestId), eq(offerRequests.status, "open"), eq(offerRequests.governorate, m.governorate), gt(offerRequests.expiresAt, new Date()))).limit(1);
  if (!req) throw new AppError("not_found");
  if (input.productId) {
    const [p] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.merchantId, m.id))).limit(1);
    if (!p) throw new AppError("not_found", "product_not_found");
  }
  return db.transaction(async (tx) => {
    const [o] = await tx
      .insert(offers)
      .values({ offerRequestId: requestId, merchantId: m.id, productId: input.productId ?? null, priceMinor: input.priceMinor, currency: input.currency, condition: input.condition, warrantyDays: input.warrantyDays, deliveryFeeMinor: input.deliveryFeeMinor, etaDays: input.etaDays, notes: input.notes, validUntil: req.expiresAt })
      .onConflictDoNothing()
      .returning();
    if (!o) throw new AppError("conflict", "offer_already_submitted");
    await notify(tx, [req.userId], "offer_received", "وصلك عرض سعر جديد", "New offer received", "/market/requests");
    return o;
  });
}

// ---------------- cart & checkout ----------------

export async function addToCart(userId: string, input: { productId?: string; offerId?: string; quantity: number }) {
  const db = await getDb();
  if (input.productId) {
    const [p] = await db.select({ id: products.id }).from(products).innerJoin(merchants, eq(merchants.id, products.merchantId)).where(and(eq(products.id, input.productId), eq(products.status, "active"), eq(merchants.status, "approved"))).limit(1);
    if (!p) throw new AppError("not_found");
  } else {
    const [o] = await db.select({ id: offers.id }).from(offers).innerJoin(offerRequests, eq(offerRequests.id, offers.offerRequestId)).where(and(eq(offers.id, input.offerId!), eq(offerRequests.userId, userId), eq(offers.status, "submitted"), gt(offers.validUntil, new Date()))).limit(1);
    if (!o) throw new AppError("not_found");
  }
  const existing = await db.select().from(cartItems).where(and(eq(cartItems.userId, userId), input.productId ? eq(cartItems.productId, input.productId) : eq(cartItems.offerId, input.offerId!))).limit(1);
  if (existing[0]) {
    await db.update(cartItems).set({ quantity: Math.min(20, input.quantity) }).where(eq(cartItems.id, existing[0].id));
  } else {
    const count = (await db.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.userId, userId))).length;
    if (count >= 30) throw new AppError("conflict", "cart_full");
    await db.insert(cartItems).values({ userId, productId: input.productId ?? null, offerId: input.offerId ?? null, quantity: input.quantity });
  }
}

export async function removeFromCart(userId: string, itemId: string) {
  const db = await getDb();
  await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.userId, userId)));
}

interface PricedLine {
  cartItemId: string;
  merchantId: string;
  merchantName: string;
  productId: string | null;
  offerId: string | null;
  title: string;
  unitPriceMinor: number;
  deliveryFeeMinor: number;
  currency: string;
  quantity: number;
  available: boolean;
}

/** Server-side pricing. The browser never supplies prices, discounts or totals. */
async function pricedCart(db: Tx | Awaited<ReturnType<typeof getDb>>, userId: string): Promise<PricedLine[]> {
  const items = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
  const lines: PricedLine[] = [];
  for (const it of items) {
    if (it.productId) {
      const [r] = await db.select({ p: products, m: merchants }).from(products).innerJoin(merchants, eq(merchants.id, products.merchantId)).where(eq(products.id, it.productId)).limit(1);
      if (!r) continue;
      lines.push({ cartItemId: it.id, merchantId: r.m.id, merchantName: r.m.name, productId: r.p.id, offerId: null, title: r.p.titleAr, unitPriceMinor: r.p.priceMinor, deliveryFeeMinor: 0, currency: r.p.currency, quantity: it.quantity, available: r.p.status === "active" && r.m.status === "approved" && r.p.stockQty >= it.quantity });
    } else if (it.offerId) {
      const [r] = await db
        .select({ o: offers, m: merchants, req: offerRequests })
        .from(offers)
        .innerJoin(merchants, eq(merchants.id, offers.merchantId))
        .innerJoin(offerRequests, eq(offerRequests.id, offers.offerRequestId))
        .where(and(eq(offers.id, it.offerId), eq(offerRequests.userId, userId)))
        .limit(1);
      if (!r) continue;
      lines.push({ cartItemId: it.id, merchantId: r.m.id, merchantName: r.m.name, productId: r.o.productId, offerId: r.o.id, title: r.req.partDescription, unitPriceMinor: r.o.priceMinor, deliveryFeeMinor: r.o.deliveryFeeMinor, currency: r.o.currency, quantity: it.quantity, available: r.o.status === "submitted" && r.o.validUntil > new Date() && r.m.status === "approved" });
    }
  }
  return lines;
}

export async function getCart(userId: string) {
  const db = await getDb();
  const lines = await pricedCart(db, userId);
  const currencies = [...new Set(lines.map((l) => l.currency))];
  const total = lines.reduce((s, l) => s + l.unitPriceMinor * l.quantity + l.deliveryFeeMinor, 0);
  return { lines, totalMinor: total, currency: currencies.length === 1 ? currencies[0] : null, mixedCurrency: currencies.length > 1 };
}

export async function checkout(userId: string, idempotencyKey: string, input: z.output<typeof CheckoutInput>, requestId?: string) {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) throw new AppError("bad_request", "idempotency_key_required");
  if (input.fulfilment === "delivery" && !input.address) throw new AppError("validation_failed", "address_required", { fields: { address: ["required"] } });
  if (input.paymentMethod === "test_gateway" && !env().PAYMENT_TEST_WEBHOOK_SECRET) throw new AppError("provider_not_configured", "test_gateway");
  if ((input.paymentMethod === "qi_card" || input.paymentMethod === "zaincash") && !GATEWAYS[input.paymentMethod].configured()) throw new AppError("provider_not_configured", input.paymentMethod);
  const requestHash = sha256Hex(JSON.stringify(input));
  const db = await getDb();

  const [prior] = await db.select().from(orders).where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, idempotencyKey))).limit(1);
  if (prior) {
    if (prior.requestHash !== requestHash) throw new AppError("conflict", "idempotency_key_reused");
    return { orderId: prior.id, replayed: true };
  }

  try {
    return await db.transaction(async (tx) => {
      const lines = await pricedCart(tx, userId);
      if (!lines.length) throw new AppError("bad_request", "cart_empty");
      const currencies = [...new Set(lines.map((l) => l.currency))];
      if (currencies.length !== 1) throw new AppError("bad_request", "mixed_currency_cart");
      if (lines.some((l) => !l.available)) throw new AppError("insufficient_stock");
      const total = lines.reduce((s, l) => s + l.unitPriceMinor * l.quantity + l.deliveryFeeMinor, 0);
      const orderId = crypto.randomUUID();
      await tx.insert(orders).values({
        id: orderId,
        userId,
        idempotencyKey,
        requestHash,
        totalMinor: total,
        currency: currencies[0]!,
        paymentMethod: input.paymentMethod,
        fulfilment: input.fulfilment,
        governorate: input.address?.governorate ?? null,
        addressEnc: input.address ? encryptField(JSON.stringify(input.address), `order:${orderId}:address`) : null,
      });

      const byMerchant = new Map<string, PricedLine[]>();
      for (const l of lines) byMerchant.set(l.merchantId, [...(byMerchant.get(l.merchantId) ?? []), l]);

      for (const [merchantId, mLines] of byMerchant) {
        const subtotal = mLines.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);
        const delivery = mLines.reduce((s, l) => s + l.deliveryFeeMinor, 0);
        const [mo] = await tx
          .insert(merchantOrders)
          .values({ orderId, merchantId, subtotalMinor: subtotal, deliveryFeeMinor: delivery, currency: currencies[0]!, statusHistory: [{ status: "pending", at: new Date().toISOString(), by: "buyer" }] })
          .returning();
        for (const l of mLines) {
          if (l.productId) {
            // Atomic conditional decrement: concurrent checkouts cannot oversell.
            const dec = await tx
              .update(products)
              .set({ stockQty: sql`${products.stockQty} - ${l.quantity}` })
              .where(and(eq(products.id, l.productId), eq(products.status, "active"), sql`${products.stockQty} >= ${l.quantity}`))
              .returning({ id: products.id });
            if (!dec[0]) throw new AppError("insufficient_stock");
            await tx.insert(inventoryReservations).values({ productId: l.productId, merchantOrderId: mo!.id, quantity: l.quantity, status: "held" });
          }
          if (l.offerId) {
            const acc = await tx.update(offers).set({ status: "accepted" }).where(and(eq(offers.id, l.offerId), eq(offers.status, "submitted"))).returning({ id: offers.id });
            if (!acc[0]) throw new AppError("conflict", "offer_no_longer_available");
          }
          await tx.insert(orderItems).values({ merchantOrderId: mo!.id, productId: l.productId, offerId: l.offerId, titleSnapshot: l.title, unitPriceMinor: l.unitPriceMinor, quantity: l.quantity });
        }
        await notify(tx, await merchantUserIds(tx, merchantId), "order_received", "طلب جديد", "New order", "/merchant/orders");
      }
      await tx.insert(payments).values({ orderId, provider: input.paymentMethod, status: "pending", amountMinor: total, currency: currencies[0]!, providerRef: input.paymentMethod === "test_gateway" ? `test_${orderId}` : null });
      await tx.delete(cartItems).where(eq(cartItems.userId, userId));
      await audit({ action: "order.placed", actorUserId: userId, targetKind: "order", targetId: orderId, requestId, meta: { merchants: byMerchant.size, method: input.paymentMethod } }, tx);
      return { orderId, replayed: false };
    });
  } catch (e) {
    // Concurrent duplicate submission with the same key: return the winner.
    if (!(e instanceof AppError) && String((e as Error).message).includes("orders_idem_uq")) {
      const [o] = await db.select().from(orders).where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, idempotencyKey))).limit(1);
      if (o) return { orderId: o.id, replayed: true };
    }
    throw e;
  }
}

export async function myOrders(userId: string) {
  const db = await getDb();
  const os = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt)).limit(50);
  if (!os.length) return [];
  const mos = await db.select({ mo: merchantOrders, merchantName: merchants.name }).from(merchantOrders).innerJoin(merchants, eq(merchants.id, merchantOrders.merchantId)).where(inArray(merchantOrders.orderId, os.map((o) => o.id)));
  const items = mos.length ? await db.select().from(orderItems).where(inArray(orderItems.merchantOrderId, mos.map((m) => m.mo.id))) : [];
  const pays = await db.select().from(payments).where(inArray(payments.orderId, os.map((o) => o.id)));
  return os.map(({ addressEnc: _a, requestHash: _h, idempotencyKey: _k, ...o }) => ({
    ...o,
    payment: pays.find((p) => p.orderId === o.id) ?? null,
    merchantOrders: mos.filter((m) => m.mo.orderId === o.id).map((m) => ({ ...m.mo, merchantName: m.merchantName, items: items.filter((i) => i.merchantOrderId === m.mo.id) })),
  }));
}

/** Merchant sees only its own sub-orders; the delivery address is decrypted only for its own orders. */
export async function merchantOrdersFor(userId: string) {
  const m = await approvedMerchantOf(userId);
  const db = await getDb();
  const mos = await db.select({ mo: merchantOrders, o: orders }).from(merchantOrders).innerJoin(orders, eq(orders.id, merchantOrders.orderId)).where(eq(merchantOrders.merchantId, m.id)).orderBy(desc(merchantOrders.createdAt)).limit(100);
  const items = mos.length ? await db.select().from(orderItems).where(inArray(orderItems.merchantOrderId, mos.map((r) => r.mo.id))) : [];
  return mos.map((r) => ({
    ...r.mo,
    fulfilment: r.o.fulfilment,
    paymentMethod: r.o.paymentMethod,
    address: r.o.addressEnc && ["confirmed", "shipped"].includes(r.mo.status) ? JSON.parse(decryptField(r.o.addressEnc, `order:${r.o.id}:address`)) : null,
    items: items.filter((i) => i.merchantOrderId === r.mo.id),
  }));
}

const TRANSITIONS: Record<MerchantOrderStatus, MerchantOrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  return_requested: ["returned", "delivered"],
  returned: [],
};

async function releaseReservations(tx: Tx, merchantOrderId: string) {
  const held = await tx.select().from(inventoryReservations).where(and(eq(inventoryReservations.merchantOrderId, merchantOrderId), inArray(inventoryReservations.status, ["held", "committed"])));
  for (const r of held) {
    await tx.update(products).set({ stockQty: sql`${products.stockQty} + ${r.quantity}` }).where(eq(products.id, r.productId));
    await tx.update(inventoryReservations).set({ status: "released" }).where(eq(inventoryReservations.id, r.id));
  }
}

export async function updateMerchantOrderStatus(userId: string, merchantOrderId: string, status: MerchantOrderStatus, note: string | undefined, requestId?: string) {
  const m = await approvedMerchantOf(userId);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [mo] = await tx.select().from(merchantOrders).where(and(eq(merchantOrders.id, merchantOrderId), eq(merchantOrders.merchantId, m.id))).for("update").limit(1);
    if (!mo) throw new AppError("not_found");
    if (!TRANSITIONS[mo.status].includes(status)) throw new AppError("conflict", "invalid_transition");
    if (status === "cancelled" || status === "returned") await releaseReservations(tx, mo.id);
    if (status === "delivered") await accrueCommission(tx, mo);
    if (status === "returned" || status === "cancelled") await voidCommission(tx, mo.id);
    if (status === "confirmed") await tx.update(inventoryReservations).set({ status: "committed" }).where(and(eq(inventoryReservations.merchantOrderId, mo.id), eq(inventoryReservations.status, "held")));
    await tx.update(merchantOrders).set({ status, updatedAt: new Date(), statusHistory: [...mo.statusHistory, { status, at: new Date().toISOString(), by: "merchant", note }] }).where(eq(merchantOrders.id, mo.id));
    const [o] = await tx.select().from(orders).where(eq(orders.id, mo.orderId)).limit(1);
    if (o && (o.paymentMethod === "qi_card" || o.paymentMethod === "zaincash") && ["confirmed", "shipped", "delivered"].includes(status)) {
      // Online orders are fulfilled only after the gateway confirmed the payment.
      const [p] = await tx.select({ s: payments.status }).from(payments).where(eq(payments.orderId, o.id)).limit(1);
      if (p?.s !== "paid") throw new AppError("conflict", "awaiting_payment");
    }
    if (status === "delivered" && o?.paymentMethod === "cod") {
      // Cash collected on delivery; recorded per merchant sub-order total in the audit trail.
      const all = await tx.select({ id: merchantOrders.id, s: merchantOrders.status }).from(merchantOrders).where(eq(merchantOrders.orderId, mo.orderId));
      if (all.every((x) => x.id === mo.id || x.s === "delivered" || x.s === "cancelled" || x.s === "returned")) await tx.update(payments).set({ status: "paid", updatedAt: new Date() }).where(eq(payments.orderId, mo.orderId));
    }
    if (o) await notify(tx, [o.userId], "order_status", `تحديث الطلب: ${status}`, `Order update: ${status}`, "/orders");
    await audit({ action: "order.status_changed", actorUserId: userId, targetKind: "merchant_order", targetId: mo.id, requestId, meta: { from: mo.status, to: status } }, tx);
  });
}

export async function cancelMyMerchantOrder(userId: string, merchantOrderId: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [r] = await tx.select({ mo: merchantOrders }).from(merchantOrders).innerJoin(orders, eq(orders.id, merchantOrders.orderId)).where(and(eq(merchantOrders.id, merchantOrderId), eq(orders.userId, userId))).limit(1);
    if (!r) throw new AppError("not_found");
    if (r.mo.status !== "pending") throw new AppError("conflict", "cannot_cancel_after_confirmation");
    await releaseReservations(tx, r.mo.id);
    await tx.update(merchantOrders).set({ status: "cancelled", updatedAt: new Date(), statusHistory: [...r.mo.statusHistory, { status: "cancelled", at: new Date().toISOString(), by: "buyer" }] }).where(eq(merchantOrders.id, r.mo.id));
  });
}

export async function requestReturn(userId: string, merchantOrderId: string, reason: string, requestId?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [r] = await tx.select({ mo: merchantOrders }).from(merchantOrders).innerJoin(orders, eq(orders.id, merchantOrders.orderId)).where(and(eq(merchantOrders.id, merchantOrderId), eq(orders.userId, userId))).for("update").limit(1);
    if (!r) throw new AppError("not_found");
    if (r.mo.status !== "delivered") throw new AppError("conflict", "return_only_after_delivery");
    const items = await tx.select({ productId: orderItems.productId }).from(orderItems).where(eq(orderItems.merchantOrderId, r.mo.id));
    const prods = items.filter((i) => i.productId).length ? await tx.select({ returnDays: products.returnDays }).from(products).where(inArray(products.id, items.map((i) => i.productId!).filter(Boolean))) : [];
    const window = Math.max(0, ...prods.map((p) => p.returnDays));
    const deliveredAt = [...r.mo.statusHistory].reverse().find((h) => h.status === "delivered")?.at;
    if (!deliveredAt || Date.now() - new Date(deliveredAt).getTime() > window * 24 * 3_600_000) throw new AppError("conflict", "return_window_closed");
    await tx.insert(returnRequests).values({ merchantOrderId: r.mo.id, userId, reason });
    await tx.update(merchantOrders).set({ status: "return_requested", updatedAt: new Date(), statusHistory: [...r.mo.statusHistory, { status: "return_requested", at: new Date().toISOString(), by: "buyer" }] }).where(eq(merchantOrders.id, r.mo.id));
    await notify(tx, await merchantUserIds(tx, r.mo.merchantId), "return_requested", "طلب إرجاع", "Return requested", "/merchant/orders");
    await audit({ action: "return.requested", actorUserId: userId, targetKind: "merchant_order", targetId: r.mo.id, requestId }, tx);
  });
}

// ---------------- test payment gateway webhook ----------------

/**
 * Signature: header `x-test-signature: t=<unix>,v1=<base64url HMAC-SHA256(secret, t + "." + rawBody)>`.
 * Rejects stale timestamps (>5 min), unknown orders and amount/currency
 * mismatches; event ids are processed once (webhook_events unique index).
 */
export async function handleTestPaymentWebhook(rawBody: string, signatureHeader: string | null, secret: string | undefined) {
  if (!secret) throw new AppError("provider_not_configured");
  const parts = Object.fromEntries((signatureHeader ?? "").split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) throw new AppError("forbidden", "bad_signature");
  const expected = hmacB64u(secret, `${t}.${rawBody}`);
  if (!safeEqual(expected, parts.v1)) throw new AppError("forbidden", "bad_signature");
  let evt: { id?: string; type?: string; orderId?: string; amountMinor?: number; currency?: string };
  try {
    evt = JSON.parse(rawBody);
  } catch {
    throw new AppError("bad_request");
  }
  if (!evt.id || !evt.orderId || !["payment.succeeded", "payment.failed"].includes(evt.type ?? "")) throw new AppError("bad_request");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const ins = await tx.insert(webhookEvents).values({ provider: "test_gateway", eventId: evt.id!, outcome: "processing" }).onConflictDoNothing().returning({ id: webhookEvents.id });
    if (!ins[0]) return { duplicate: true };
    const [p] = await tx.select().from(payments).where(and(eq(payments.orderId, evt.orderId!), eq(payments.provider, "test_gateway"))).limit(1);
    let outcome = "ignored";
    if (!p) outcome = "unknown_order";
    else if (p.amountMinor !== evt.amountMinor || p.currency !== evt.currency) outcome = "amount_mismatch";
    else if (p.status === "pending") {
      await tx.update(payments).set({ status: evt.type === "payment.succeeded" ? "paid" : "failed", updatedAt: new Date() }).where(eq(payments.id, p.id));
      outcome = evt.type === "payment.succeeded" ? "paid" : "failed";
    }
    await tx.update(webhookEvents).set({ outcome }).where(eq(webhookEvents.id, ins[0].id));
    await audit({ action: "payment.webhook", targetKind: "order", targetId: evt.orderId, meta: { outcome, type: evt.type } }, tx);
    return { duplicate: false, outcome };
  });
}

// ---------------- reviews ----------------

export async function reviewMerchant(userId: string, merchantOrderId: string, rating: number, body: string) {
  const db = await getDb();
  const [r] = await db.select({ mo: merchantOrders }).from(merchantOrders).innerJoin(orders, eq(orders.id, merchantOrders.orderId)).where(and(eq(merchantOrders.id, merchantOrderId), eq(orders.userId, userId))).limit(1);
  if (!r) throw new AppError("not_found");
  if (r.mo.status !== "delivered") throw new AppError("conflict", "review_requires_delivery");
  const ins = await db.insert(reviews).values({ authorId: userId, targetKind: "merchant", targetId: r.mo.merchantId, proofKind: "merchant_order", proofId: r.mo.id, rating, body }).onConflictDoNothing().returning();
  if (!ins[0]) throw new AppError("conflict", "already_reviewed");
  return ins[0];
}

export async function publicReviews(targetKind: "merchant" | "workshop", targetId: string) {
  const db = await getDb();
  const rows = await db.select({ rating: reviews.rating, body: reviews.body, createdAt: reviews.createdAt, id: reviews.id }).from(reviews).where(and(eq(reviews.targetKind, targetKind), eq(reviews.targetId, targetId), eq(reviews.status, "published"))).orderBy(desc(reviews.createdAt)).limit(50);
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null;
  return { average: avg, count: rows.length, items: rows };
}

export async function flagReview(reviewId: string) {
  const db = await getDb();
  await db.update(reviews).set({ flagCount: sql`${reviews.flagCount} + 1`, status: sql`case when ${reviews.flagCount} + 1 >= 3 then 'flagged' else ${reviews.status} end` }).where(eq(reviews.id, reviewId));
}

export async function moderateReview(moderatorId: string, reviewId: string, status: "published" | "hidden", requestId?: string) {
  const db = await getDb();
  const [r] = await db.update(reviews).set({ status }).where(eq(reviews.id, reviewId)).returning({ id: reviews.id });
  if (!r) throw new AppError("not_found");
  await audit({ action: "review.moderated", actorUserId: moderatorId, targetKind: "review", targetId: reviewId, requestId, meta: { status } });
}

export async function flaggedReviews() {
  const db = await getDb();
  return db.select().from(reviews).where(eq(reviews.status, "flagged")).orderBy(desc(reviews.createdAt)).limit(100);
}

