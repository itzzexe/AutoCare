import { generateKeyPairSync, createSign } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as qiWebhookRoute } from "@/app/api/v1/webhooks/qi-card/route";
import { env, resetEnvCache } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { aiUsage, commissionEntries, merchantMembers, merchants, payments, plans, subscriptions, workshopMembers, workshops } from "@/server/db/schema";
import * as billing from "@/server/modules/billing/service";
import * as market from "@/server/modules/market/service";
import { signHs256, verifyHs256 } from "@/server/modules/payments/gateways";
import { handleGatewayReturn, handleQiWebhook, startOrderPayment } from "@/server/modules/payments/service";
import { resetBreakers } from "@/server/modules/providers/resilience";
import { createVehicle } from "@/server/modules/vehicles/service";
import { directory } from "@/server/modules/workshops/service";
import { freshDb, json, makeUser, params, req } from "./support/db";

const car = (n: number) => ({ make: "Toyota", model: `Corolla ${n}`, year: 2016, fuel: "petrol" as const, transmission: "automatic" as const, salesMarket: "IQ" as const, odometerUnit: "km" as const });
const product = (stock = 5, price = 50_000) => ({ titleAr: "فلتر زيت", brand: "Denso", category: "filters", oeNumbers: ["90915-YZZE1"], condition: "new" as const, authenticityClaim: "oem_genuine" as const, priceMinor: price, currency: "IQD" as const, stockQty: stock, warrantyDays: 0, returnDays: 7, deliveryOptions: ["pickup"] as Array<"pickup" | "delivery">, imageIds: [], fitments: [] });
const key = () => crypto.randomUUID().replace(/-/g, "");

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const QI_PUB = publicKey.export({ type: "spki", format: "pem" }).toString();
const qiSign = (b: { paymentId: string; amount: number; currency: string; creationDate: string; status: string }) =>
  createSign("RSA-SHA256").update(`${b.paymentId}|${b.amount.toFixed(3)}|${b.currency}|${b.creationDate}|${b.status}`).sign(privateKey, "base64");

const ENV_KEYS = ["QI_API_BASE", "QI_USERNAME", "QI_PASSWORD", "QI_TERMINAL_ID", "QI_WEBHOOK_PUBLIC_KEY", "ZAINCASH_MERCHANT_ID", "ZAINCASH_SECRET", "ZAINCASH_MSISDN", "ZAINCASH_ENV", "APP_ENV", "DATABASE_URL", "REDIS_URL", "TRUSTED_PROXY_HOPS", "APP_ORIGIN"] as const;
const saved: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}
const gatewaysOn = () =>
  setEnv({
    QI_API_BASE: "https://uat-sandbox-3ds-api.qi.iq/api/v1", QI_USERNAME: "u", QI_PASSWORD: "p", QI_TERMINAL_ID: "237984", QI_WEBHOOK_PUBLIC_KEY: QI_PUB,
    ZAINCASH_MERCHANT_ID: "5ffacf6612b5777c6d44266f", ZAINCASH_SECRET: "test-secret-not-real", ZAINCASH_MSISDN: "9647835077893", ZAINCASH_ENV: "test",
  });

let admin: Awaited<ReturnType<typeof makeUser>>;
let merchantUser: Awaited<ReturnType<typeof makeUser>>;
let merchantId: string;

async function setPrice(planId: string, price: number) {
  await billing.adminUpdatePlan(admin.id, planId, { priceMinor: price, published: true });
}
async function activateManually(userId: string, planId: string, subjectKind: "user" | "merchant" | "workshop", subjectId: string) {
  const r = await billing.startSubscription(userId, { planId, subjectKind, subjectId, method: "manual", locale: "ar" });
  await billing.confirmManualSubscription(admin.id, r.subscriptionId, "cash received at office");
  return r.subscriptionId;
}

beforeAll(async () => {
  await freshDb();
  const db = await getDb();
  await billing.seedPlans(db);
  admin = await makeUser(["sysadmin"], { mfa: true });
  merchantUser = await makeUser(["vehicle_owner", "merchant"]);
  const [m] = await db.insert(merchants).values({ ownerUserId: merchantUser.id, name: "Parts C", governorate: "BGD", city: "Sinak", phoneEnc: "v1.t1.a.b.c", status: "approved" }).returning();
  await db.insert(merchantMembers).values({ merchantId: m!.id, userId: merchantUser.id, role: "owner" });
  merchantId = m!.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
  setEnv(saved);
  resetBreakers();
});

describe("plans and entitlements", () => {
  it("never offers a paid plan without a price, and free plans cannot carry one", async () => {
    expect((await billing.publicPlans()).map((p) => p.id).sort()).toEqual(["merchant_free", "owner_free", "workshop_free"]);
    await expect(billing.adminUpdatePlan(admin.id, "owner_pro", { published: true })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(billing.adminUpdatePlan(admin.id, "owner_free", { priceMinor: 5000 })).rejects.toMatchObject({ code: "validation_failed" });
    const u = await makeUser();
    await expect(billing.startSubscription(u.id, { planId: "owner_pro", subjectKind: "user", subjectId: u.id, method: "manual", locale: "ar" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("enforces the free vehicle limit server-side and lifts it only after a confirmed payment", async () => {
    const u = await makeUser();
    for (let i = 0; i < 3; i++) await createVehicle(u.id, car(i));
    await expect(createVehicle(u.id, car(4))).rejects.toMatchObject({ code: "plan_limit", message: "max_vehicles" });

    await setPrice("owner_pro", 7_500);
    const r = await billing.startSubscription(u.id, { planId: "owner_pro", subjectKind: "user", subjectId: u.id, method: "manual", locale: "ar" });
    expect(r).toMatchObject({ status: "pending_manual", redirectUrl: null });
    // A pending request grants nothing.
    await expect(createVehicle(u.id, car(4))).rejects.toMatchObject({ code: "plan_limit" });
    await expect(billing.startSubscription(u.id, { planId: "owner_pro", subjectKind: "user", subjectId: u.id, method: "manual", locale: "ar" })).rejects.toMatchObject({ message: "subscription_request_pending" });

    await billing.confirmManualSubscription(admin.id, r.subscriptionId, undefined);
    await expect(createVehicle(u.id, car(4))).resolves.toBeTruthy();
    expect((await billing.entitlementsFor("user", u.id)).planId).toBe("owner_pro");
    await expect(billing.confirmManualSubscription(admin.id, r.subscriptionId, undefined)).rejects.toMatchObject({ code: "conflict" });
  });

  it("stacks a renewal on the remaining paid period instead of discarding it", async () => {
    const u = await makeUser();
    await activateManually(u.id, "owner_pro", "user", u.id);
    await activateManually(u.id, "owner_pro", "user", u.id);
    const db = await getDb();
    const rows = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, u.id), eq(subscriptions.status, "active")));
    const [a, b] = rows.sort((x, y) => x.periodEnd!.getTime() - y.periodEnd!.getTime());
    expect(b!.periodStart!.getTime()).toBe(a!.periodEnd!.getTime());
  });

  it("refuses to sell a business plan for a business the user does not own", async () => {
    await setPrice("merchant_pro", 25_000);
    const stranger = await makeUser(["vehicle_owner", "merchant"]);
    await expect(billing.startSubscription(stranger.id, { planId: "merchant_pro", subjectKind: "merchant", subjectId: merchantId, method: "manual", locale: "ar" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(billing.startSubscription(stranger.id, { planId: "merchant_pro", subjectKind: "user", subjectId: stranger.id, method: "manual", locale: "ar" })).rejects.toMatchObject({ message: "plan_audience_mismatch" });
  });

  it("caps monthly AI explanations per plan without touching the rules result", async () => {
    const u = await makeUser();
    const db = await getDb();
    await db.insert(aiUsage).values(Array.from({ length: 20 }, () => ({ userId: u.id, kind: "diagnosis" as const, model: "m", status: "ok" })));
    await expect(billing.assertAiAllowance(u.id)).rejects.toMatchObject({ code: "plan_limit", message: "ai_monthly_allowance" });
  });
});

describe("commission ledger", () => {
  async function deliveredOrder(price: number, qty = 1) {
    const buyer = await makeUser();
    const p = await market.upsertProduct(merchantUser.id, product(10, price));
    await market.addToCart(buyer.id, { productId: p.id, quantity: qty });
    const { orderId } = await market.checkout(buyer.id, key(), { paymentMethod: "cod", fulfilment: "pickup" });
    const [mo] = (await market.myOrders(buyer.id)).find((o) => o.id === orderId)!.merchantOrders;
    for (const s of ["confirmed", "shipped", "delivered"] as const) await market.updateMerchantOrderStatus(merchantUser.id, mo!.id, s, undefined);
    return { buyer, merchantOrderId: mo!.id };
  }

  it("accrues once per delivered order at the plan's rate, and voids on return", async () => {
    const { buyer, merchantOrderId } = await deliveredOrder(100_000, 2);
    const db = await getDb();
    const [c] = await db.select().from(commissionEntries).where(eq(commissionEntries.merchantOrderId, merchantOrderId));
    expect(c).toMatchObject({ baseMinor: 200_000, rateBps: 800, amountMinor: 16_000, status: "accrued" });

    await market.requestReturn(buyer.id, merchantOrderId, "wrong part");
    await market.updateMerchantOrderStatus(merchantUser.id, merchantOrderId, "returned", undefined);
    const [v] = await db.select().from(commissionEntries).where(eq(commissionEntries.merchantOrderId, merchantOrderId));
    expect(v!.status).toBe("void");
  });

  it("applies the lower Pro rate once the merchant's plan is active", async () => {
    await setPrice("merchant_pro", 25_000);
    await activateManually(merchantUser.id, "merchant_pro", "merchant", merchantId);
    const { merchantOrderId } = await deliveredOrder(40_000);
    const db = await getDb();
    const [c] = await db.select().from(commissionEntries).where(eq(commissionEntries.merchantOrderId, merchantOrderId));
    expect(c).toMatchObject({ rateBps: 500, amountMinor: 2_000 });
    const st = await billing.merchantStatement(merchantId);
    expect(st.entries.length).toBeGreaterThanOrEqual(2);
  });
});

describe("paid placement", () => {
  it("labels sponsored products only while the plan is paid, within the allowance, in a separate block", async () => {
    const free = await makeUser(["vehicle_owner", "merchant"]);
    const db = await getDb();
    const [m] = await db.insert(merchants).values({ ownerUserId: free.id, name: "Free shop", governorate: "BSR", city: "Ashar", phoneEnc: "v1.t1.a.b.c", status: "approved" }).returning();
    await db.insert(merchantMembers).values({ merchantId: m!.id, userId: free.id, role: "owner" });
    const fp = await market.upsertProduct(free.id, product());
    await expect(market.setProductSponsored(free.id, fp.id, true)).rejects.toMatchObject({ code: "plan_limit" });
    // Even a raw DB flag does not produce an ad label without a paid plan.
    await db.update((await import("@/server/db/schema")).products).set({ sponsored: true }).where(eq((await import("@/server/db/schema")).products.id, fp.id));
    expect((await market.searchCatalog({ q: "فلتر", limit: 50 })).find((p) => p.id === fp.id)?.sponsored).toBe(false);
    expect((await market.sponsoredForCatalog({ q: "فلتر" })).some((p) => p.id === fp.id)).toBe(false);

    // merchantUser has merchant_pro (activated above).
    const pp = await market.upsertProduct(merchantUser.id, product());
    await market.setProductSponsored(merchantUser.id, pp.id, true);
    expect((await market.searchCatalog({ q: "فلتر", limit: 50 })).find((p) => p.id === pp.id)?.sponsored).toBe(true);
    const block = await market.sponsoredForCatalog({ q: "فلتر" });
    expect(block.length).toBeLessThanOrEqual(3);
    expect(block.every((p) => p.merchant.id === merchantId)).toBe(true);
  });

  it("marks featured workshops only with an active paid plan", async () => {
    const owner = await makeUser(["vehicle_owner", "workshop"]);
    const db = await getDb();
    const [w] = await db.insert(workshops).values({ ownerUserId: owner.id, name: "Al-Noor Garage", governorate: "NJF", city: "Najaf", address: "Industrial area", phoneEnc: "v1.t1.a.b.c", specialties: ["engine"], status: "approved" }).returning();
    await db.insert(workshopMembers).values({ workshopId: w!.id, userId: owner.id, role: "owner" });
    expect((await directory({ governorate: "NJF" })).find((x) => x.id === w!.id)?.featured).toBe(false);
    await setPrice("workshop_featured", 30_000);
    await activateManually(owner.id, "workshop_featured", "workshop", w!.id);
    expect((await directory({ governorate: "NJF" })).find((x) => x.id === w!.id)?.featured).toBe(true);
  });
});

describe("gateway security", () => {
  it("HS256 tokens: rejects tampering, 'none' and expiry", () => {
    const tok = signHs256({ id: "abc", exp: Math.floor(Date.now() / 1000) + 60 }, "s3cret");
    expect(verifyHs256(tok, "s3cret")).toMatchObject({ id: "abc" });
    expect(() => verifyHs256(tok, "other")).toThrow();
    const [h, p] = tok.split(".");
    const forged = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${p}.`;
    expect(() => verifyHs256(forged, "s3cret")).toThrow();
    const tampered = `${h}.${Buffer.from(JSON.stringify({ id: "evil", exp: 9e9 })).toString("base64url")}.${tok.split(".")[2]}`;
    expect(() => verifyHs256(tampered, "s3cret")).toThrow();
    const old = signHs256({ id: "abc", exp: Math.floor(Date.now() / 1000) - 3600 }, "s3cret");
    expect(() => verifyHs256(old, "s3cret")).toThrow(/jwt_expired/);
  });

  it("refuses online checkout when the gateway is not configured", async () => {
    const buyer = await makeUser();
    const p = await market.upsertProduct(merchantUser.id, product());
    await market.addToCart(buyer.id, { productId: p.id, quantity: 1 });
    await expect(market.checkout(buyer.id, key(), { paymentMethod: "qi_card", fulfilment: "pickup" })).rejects.toMatchObject({ code: "provider_not_configured" });
  });

  it("Qi Card: order is paid only by a correctly signed webhook, once, for the right amount; merchants cannot ship before", async () => {
    gatewaysOn();
    const buyer = await makeUser();
    const p = await market.upsertProduct(merchantUser.id, product(5, 60_000));
    await market.addToCart(buyer.id, { productId: p.id, quantity: 1 });
    const { orderId } = await market.checkout(buyer.id, key(), { paymentMethod: "qi_card", fulfilment: "pickup" });
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://uat-sandbox-3ds-api.qi.iq/api/v1/payment");
      expect((init.headers as Record<string, string>)["x-terminal-id"]).toBe("237984");
      expect(JSON.parse(String(init.body))).toMatchObject({ amount: 60_000, currency: "IQD" });
      return new Response(JSON.stringify({ paymentId: "qi-pay-1", status: "CREATED", formUrl: "https://uat-sandbox-3ds.qi.iq/pay/qi-pay-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { redirectUrl } = await startOrderPayment(buyer.id, orderId, "ar");
    expect(redirectUrl).toBe("https://uat-sandbox-3ds.qi.iq/pay/qi-pay-1");

    const [mo] = (await market.myOrders(buyer.id)).find((o) => o.id === orderId)!.merchantOrders;
    await expect(market.updateMerchantOrderStatus(merchantUser.id, mo!.id, "confirmed", undefined)).rejects.toMatchObject({ message: "awaiting_payment" });

    const evt = { paymentId: "qi-pay-1", amount: 60_000, currency: "IQD", creationDate: "2026-10-02T10:00:00Z", status: "SUCCESS" };
    const raw = JSON.stringify(evt);
    await expect(handleQiWebhook(raw, Buffer.from("forged").toString("base64"))).rejects.toMatchObject({ code: "unauthenticated" });
    const tamperedAmount = JSON.stringify({ ...evt, amount: 1 });
    await expect(handleQiWebhook(tamperedAmount, qiSign(evt))).rejects.toMatchObject({ code: "unauthenticated" });

    const res = await json(await qiWebhookRoute(req("POST", "/api/v1/webhooks/qi-card", { raw, headers: { "content-type": "application/json", "x-signature": qiSign(evt) }, csrf: null, origin: null }), params()));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("paid");
    expect((await handleQiWebhook(raw, qiSign(evt))).outcome).toBe("duplicate");
    const db = await getDb();
    expect((await db.select().from(payments).where(eq(payments.orderId, orderId)))[0]!.status).toBe("paid");
    await expect(market.updateMerchantOrderStatus(merchantUser.id, mo!.id, "confirmed", undefined)).resolves.toBeUndefined();
  });

  it("Qi Card: a signed webhook for the wrong amount does not mark the order paid", async () => {
    gatewaysOn();
    const buyer = await makeUser();
    const p = await market.upsertProduct(merchantUser.id, product(5, 30_000));
    await market.addToCart(buyer.id, { productId: p.id, quantity: 1 });
    const { orderId } = await market.checkout(buyer.id, key(), { paymentMethod: "qi_card", fulfilment: "pickup" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ paymentId: "qi-pay-2", status: "CREATED", formUrl: "https://uat-sandbox-3ds.qi.iq/pay/qi-pay-2" }), { status: 200 })));
    await startOrderPayment(buyer.id, orderId, "ar");
    const evt = { paymentId: "qi-pay-2", amount: 1_000, currency: "IQD", creationDate: "2026-10-02T10:00:00Z", status: "SUCCESS" };
    expect((await handleQiWebhook(JSON.stringify(evt), qiSign(evt))).outcome).toBe("failed");
    const db = await getDb();
    expect((await db.select().from(payments).where(eq(payments.orderId, orderId)))[0]!.status).toBe("failed");
  });

  it("ZainCash: the browser return is verified and re-confirmed with the gateway before activation", async () => {
    gatewaysOn();
    await setPrice("owner_pro", 7_500);
    const u = await makeUser();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url);
      const form = new URLSearchParams(String(init.body));
      expect(form.get("merchantId")).toBe("5ffacf6612b5777c6d44266f");
      const claims = verifyHs256(form.get("token")!, "test-secret-not-real");
      if (url.endsWith("/transaction/init")) {
        expect(claims).toMatchObject({ amount: 7_500, msisdn: "9647835077893" });
        return new Response(JSON.stringify({ id: "zc_tx_123456" }), { status: 200 });
      }
      expect(claims).toMatchObject({ id: "zc_tx_123456" });
      return new Response(JSON.stringify({ status: "success" }), { status: 200 });
    }));
    const r = await billing.startSubscription(u.id, { planId: "owner_pro", subjectKind: "user", subjectId: u.id, method: "zaincash", locale: "ar" });
    expect(r.redirectUrl).toBe("https://test.zaincash.iq/transaction/pay?id=zc_tx_123456");

    const ref = `sub_${r.subscriptionId}`;
    // Token signed with the wrong key, or for another reference, is refused.
    const bad = signHs256({ status: "success", orderid: ref, id: "zc_tx_123456" }, "attacker");
    await expect(handleGatewayReturn("zaincash", new URLSearchParams({ ref, token: bad }))).rejects.toBeTruthy();
    const other = signHs256({ status: "success", orderid: "sub_00000000-0000-0000-0000-000000000000", id: "zc_tx_123456" }, "test-secret-not-real");
    await expect(handleGatewayReturn("zaincash", new URLSearchParams({ ref, token: other }))).rejects.toMatchObject({ message: "reference_mismatch" });
    // No token = cancelled on the gateway page.
    expect(await handleGatewayReturn("zaincash", new URLSearchParams({ ref }))).toBe("/account/billing?payment=cancelled");

    const good = signHs256({ status: "success", orderid: ref, id: "zc_tx_123456" }, "test-secret-not-real");
    expect(await handleGatewayReturn("zaincash", new URLSearchParams({ ref, token: good }))).toBe("/account/billing?payment=paid");
    expect(calls.some((c) => c === "https://test.zaincash.iq/transaction/get")).toBe(true);
    expect((await billing.entitlementsFor("user", u.id)).planId).toBe("owner_pro");
  });

  it("refuses sandbox gateway settings and the test gateway in production", () => {
    setEnv({ APP_ENV: "production", DATABASE_URL: "postgres://x/y", REDIS_URL: "redis://x", TRUSTED_PROXY_HOPS: "1", APP_ORIGIN: "https://autocare.example", QI_API_BASE: "https://uat-sandbox-3ds-api.qi.iq/api/v1", QI_USERNAME: "u", QI_PASSWORD: "p", QI_TERMINAL_ID: "1" });
    expect(() => env()).toThrow(/sandbox|PAYMENT_TEST_WEBHOOK_SECRET|QI_WEBHOOK_PUBLIC_KEY/);
  });
});

describe("plan catalogue integrity", () => {
  it("seeds every paid plan unpublished and unpriced", async () => {
    const db = await freshDb().then(() => getDb());
    await billing.seedPlans(db);
    const rows = await db.select().from(plans);
    expect(rows.filter((p) => p.tier === "paid").every((p) => p.priceMinor === null && !p.published)).toBe(true);
  });
});
