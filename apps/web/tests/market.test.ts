import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { merchantMembers, merchantOrders, merchants, partFitments, payments, products } from "@/server/db/schema";
import { hmacB64u } from "@/server/lib/crypto";
import * as market from "@/server/modules/market/service";
import { createVehicle } from "@/server/modules/vehicles/service";
import { freshDb, makeUser } from "./support/db";

const product = (stock: number, price = 50_000) => ({ titleAr: "قماشات أمامية", brand: "Akebono", category: "brakes", oeNumbers: ["04465-02220"], condition: "new" as const, authenticityClaim: "oem_genuine" as const, priceMinor: price, currency: "IQD" as const, stockQty: stock, warrantyDays: 90, returnDays: 7, deliveryOptions: ["pickup", "delivery"] as Array<"pickup" | "delivery">, imageIds: [], fitments: [{ make: "Toyota", model: "Corolla", yearFrom: 2014, yearTo: 2019 }] });
const checkoutBody = { paymentMethod: "cod" as const, fulfilment: "pickup" as const };
const key = () => crypto.randomUUID().replace(/-/g, "");

let merchantUser: Awaited<ReturnType<typeof makeUser>>;
let merchantUser2: Awaited<ReturnType<typeof makeUser>>;
beforeAll(async () => {
  await freshDb();
  const db = await getDb();
  merchantUser = await makeUser(["vehicle_owner", "merchant"]);
  merchantUser2 = await makeUser(["vehicle_owner", "merchant"]);
  for (const [u, name] of [[merchantUser, "Parts A"], [merchantUser2, "Parts B"]] as const) {
    const [m] = await db.insert(merchants).values({ ownerUserId: u.id, name, governorate: "BGD", city: "Sinak", phoneEnc: "v1.t1.a.b.c", status: "approved" }).returning();
    await db.insert(merchantMembers).values({ merchantId: m!.id, userId: u.id, role: "owner" });
  }
});

describe("fitment labels", () => {
  it("text similarity never becomes compatibility; only provider/moderator evidence does", async () => {
    const p = await market.upsertProduct(merchantUser.id, product(5));
    const corolla = { make: "Toyota", model: "Corolla", year: 2016, engine: null };
    expect((await market.productDetail(p.id, corolla)).fitment).toBe("seller_claim");
    expect((await market.productDetail(p.id, { ...corolla, model: "Camry" })).fitment).toBe("needs_confirmation");
    expect((await market.productDetail(p.id)).fitment).toBe("needs_confirmation");
    const db = await getDb();
    await db.insert(partFitments).values({ productId: p.id, make: "Toyota", model: "Corolla", yearFrom: 2014, yearTo: 2019, source: "moderator_verified" });
    expect((await market.productDetail(p.id, corolla)).fitment).toBe("compatible_per_source");
    expect((await market.productDetail(p.id)).authenticityVerified).toBe(false);
  });
});

describe("checkout", () => {
  it("prices on the server, splits by merchant, and replays idempotently", async () => {
    const buyer = await makeUser();
    const a = await market.upsertProduct(merchantUser.id, product(3, 40_000));
    const b = await market.upsertProduct(merchantUser2.id, product(3, 25_000));
    await market.addToCart(buyer.id, { productId: a.id, quantity: 2 });
    await market.addToCart(buyer.id, { productId: b.id, quantity: 1 });
    const k = key();
    const first = await market.checkout(buyer.id, k, checkoutBody);
    const again = await market.checkout(buyer.id, k, checkoutBody);
    expect(again).toEqual({ orderId: first.orderId, replayed: true });
    await expect(market.checkout(buyer.id, k, { ...checkoutBody, paymentMethod: "test_gateway" })).rejects.toMatchObject({ message: "idempotency_key_reused" });
    const [order] = await market.myOrders(buyer.id);
    expect(order!.totalMinor).toBe(2 * 40_000 + 25_000);
    expect(order!.merchantOrders).toHaveLength(2);
    const db = await getDb();
    expect((await db.select().from(products).where(eq(products.id, a.id)))[0]!.stockQty).toBe(1);
  });

  it("prevents overselling under concurrent checkouts", async () => {
    const p = await market.upsertProduct(merchantUser.id, product(1));
    const buyers = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const b of buyers) await market.addToCart(b.id, { productId: p.id, quantity: 1 });
    const results = await Promise.allSettled(buyers.map((b) => market.checkout(b.id, key(), checkoutBody)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason.code === "insufficient_stock")).toBe(true);
    const db = await getDb();
    expect((await db.select().from(products).where(eq(products.id, p.id)))[0]!.stockQty).toBe(0);
  });

  it("requires a delivery address for delivery and encrypts it", async () => {
    const buyer = await makeUser();
    const p = await market.upsertProduct(merchantUser.id, product(2));
    await market.addToCart(buyer.id, { productId: p.id, quantity: 1 });
    await expect(market.checkout(buyer.id, key(), { paymentMethod: "cod", fulfilment: "delivery" })).rejects.toMatchObject({ code: "validation_failed" });
    const { orderId } = await market.checkout(buyer.id, key(), { paymentMethod: "cod", fulfilment: "delivery", address: { governorate: "BGD", city: "الكرادة", street: "شارع 62", recipientName: "Sara", phone: "07701112233" } });
    const db = await getDb();
    const { orders } = await import("@/server/db/schema");
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o!.addressEnc).toMatch(/^v1\./);
    expect(o!.addressEnc).not.toContain("07701112233");
  });

  it("cancellation releases stock; returns only within the window after delivery", async () => {
    const buyer = await makeUser();
    const p = await market.upsertProduct(merchantUser.id, product(2));
    await market.addToCart(buyer.id, { productId: p.id, quantity: 2 });
    await market.checkout(buyer.id, key(), checkoutBody);
    const [o] = await market.myOrders(buyer.id);
    const mo = o!.merchantOrders[0]!;
    await expect(market.requestReturn(buyer.id, mo.id, "wrong part")).rejects.toMatchObject({ message: "return_only_after_delivery" });
    await market.cancelMyMerchantOrder(buyer.id, mo.id);
    const db = await getDb();
    expect((await db.select().from(products).where(eq(products.id, p.id)))[0]!.stockQty).toBe(2);
  });

  it("merchant transitions follow the state machine; COD becomes paid on delivery; reviews need delivery", async () => {
    const buyer = await makeUser();
    const p = await market.upsertProduct(merchantUser.id, product(1));
    await market.addToCart(buyer.id, { productId: p.id, quantity: 1 });
    const { orderId } = await market.checkout(buyer.id, key(), checkoutBody);
    const db = await getDb();
    const [mo] = await db.select().from(merchantOrders).where(eq(merchantOrders.orderId, orderId));
    await expect(market.reviewMerchant(buyer.id, mo!.id, 5, "")).rejects.toMatchObject({ message: "review_requires_delivery" });
    await expect(market.updateMerchantOrderStatus(merchantUser.id, mo!.id, "delivered", undefined)).rejects.toMatchObject({ message: "invalid_transition" });
    await expect(market.updateMerchantOrderStatus(merchantUser2.id, mo!.id, "confirmed", undefined)).rejects.toMatchObject({ code: "not_found" });
    for (const s of ["confirmed", "shipped", "delivered"] as const) await market.updateMerchantOrderStatus(merchantUser.id, mo!.id, s, undefined);
    expect((await db.select().from(payments).where(eq(payments.orderId, orderId)))[0]!.status).toBe("paid");
    await market.reviewMerchant(buyer.id, mo!.id, 4, "جيد");
    await expect(market.reviewMerchant(buyer.id, mo!.id, 5, "again")).rejects.toMatchObject({ message: "already_reviewed" });
    await market.requestReturn(buyer.id, mo!.id, "لا يناسب");
  });
});

describe("test payment webhook", () => {
  async function pendingTestOrder() {
    const buyer = await makeUser();
    const p = await market.upsertProduct(merchantUser.id, product(1, 30_000));
    await market.addToCart(buyer.id, { productId: p.id, quantity: 1 });
    return market.checkout(buyer.id, key(), { paymentMethod: "test_gateway", fulfilment: "pickup" });
  }
  const secret = () => process.env.PAYMENT_TEST_WEBHOOK_SECRET!;
  const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${hmacB64u(secret(), `${t}.${body}`)}`;

  it("verifies signature, timestamp, amount, and processes each event once", async () => {
    const { orderId } = await pendingTestOrder();
    const body = JSON.stringify({ id: `evt_${orderId}`, type: "payment.succeeded", orderId, amountMinor: 30_000, currency: "IQD" });
    await expect(market.handleTestPaymentWebhook(body, "t=1,v1=bad", secret())).rejects.toMatchObject({ message: "bad_signature" });
    await expect(market.handleTestPaymentWebhook(body, sign(body, Math.floor(Date.now() / 1000) - 3600), secret())).rejects.toMatchObject({ message: "bad_signature" });
    expect(await market.handleTestPaymentWebhook(body, sign(body), secret())).toEqual({ duplicate: false, outcome: "paid" });
    expect(await market.handleTestPaymentWebhook(body, sign(body), secret())).toEqual({ duplicate: true });
  });

  it("does not trust an amount that differs from the server's order total", async () => {
    const { orderId } = await pendingTestOrder();
    const body = JSON.stringify({ id: `evt2_${orderId}`, type: "payment.succeeded", orderId, amountMinor: 1, currency: "IQD" });
    expect(await market.handleTestPaymentWebhook(body, sign(body), secret())).toEqual({ duplicate: false, outcome: "amount_mismatch" });
    const db = await getDb();
    expect((await db.select().from(payments).where(eq(payments.orderId, orderId)))[0]!.status).toBe("pending");
  });
});

describe("offer requests", () => {
  it("one offer per merchant; buyer sees offers sorted by landed price", async () => {
    const buyer = await makeUser();
    const v = await createVehicle(buyer.id, { make: "Toyota", model: "Corolla", year: 2016, fuel: "petrol", transmission: "automatic", salesMarket: "GCC", odometerUnit: "km" });
    const r = await market.createOfferRequest(buyer.id, { vehicleId: v.id, partDescription: "ردياتر", quantity: 1, governorate: "BGD" });
    await market.submitOffer(merchantUser.id, r.id, { priceMinor: 120_000, currency: "IQD", condition: "new", warrantyDays: 30, deliveryFeeMinor: 5_000, etaDays: 1 });
    await market.submitOffer(merchantUser2.id, r.id, { priceMinor: 100_000, currency: "IQD", condition: "used", warrantyDays: 0, deliveryFeeMinor: 10_000, etaDays: 2 });
    await expect(market.submitOffer(merchantUser.id, r.id, { priceMinor: 1, currency: "IQD", condition: "new", warrantyDays: 0, deliveryFeeMinor: 0, etaDays: 0 })).rejects.toMatchObject({ message: "offer_already_submitted" });
    const [mine] = await market.myOfferRequests(buyer.id);
    expect(mine!.offers.map((o) => o.priceMinor + o.deliveryFeeMinor)).toEqual([110_000, 125_000]);
    await market.addToCart(buyer.id, { offerId: mine!.offers[0]!.id, quantity: 1 });
    const cart = await market.getCart(buyer.id);
    expect(cart.totalMinor).toBe(110_000);
  });
});
