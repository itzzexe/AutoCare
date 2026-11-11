import "server-only";
import { and, eq } from "drizzle-orm";
import { env } from "../../config/env";
import { getDb } from "../../db/client";
import { notifications, orders, payments, subscriptions, webhookEvents } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { audit } from "../audit/audit";
import { applySubscriptionPayment } from "../billing/service";
import { GATEWAYS, verifyQiWebhook, verifyZainCashReturn, type GatewayId, type GatewayPaymentStatus } from "./gateways";

/**
 * Order and subscription payments through hosted gateways.
 * Source of truth for "paid": a signed webhook (Qi) or a server-side status
 * query to the gateway (both). A browser redirect alone never marks anything paid.
 */

export const isGateway = (m: string): m is GatewayId => m in GATEWAYS;
const notifyPath = (g: GatewayId) => `/api/v1/webhooks/${g === "qi_card" ? "qi-card" : g}`;

export async function startOrderPayment(userId: string, orderId: string, locale: "ar" | "en", requestId?: string): Promise<{ redirectUrl: string }> {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
  if (!o) throw new AppError("not_found");
  if (!isGateway(o.paymentMethod)) throw new AppError("bad_request", "not_an_online_payment");
  const gw = GATEWAYS[o.paymentMethod];
  if (!gw.configured()) throw new AppError("provider_not_configured", gw.id);
  const [p] = await db.select().from(payments).where(eq(payments.orderId, o.id)).limit(1);
  if (!p) throw new AppError("not_found");
  if (p.status === "paid") throw new AppError("conflict", "already_paid");
  if (o.status === "cancelled") throw new AppError("conflict", "order_cancelled");
  if (o.totalMinor < gw.minAmountIqd) throw new AppError("bad_request", "amount_below_gateway_minimum");
  const origin = env().APP_ORIGIN;
  const r = await gw.createPayment({
    reference: `ord_${o.id}`,
    amountIqd: o.totalMinor,
    locale,
    returnUrl: `${origin}/api/v1/payments/${gw.id}/return?ref=ord_${o.id}`,
    notifyUrl: `${origin}${notifyPath(gw.id)}`,
    serviceType: "AutoCare parts order",
  });
  // A retry replaces the previous gateway reference; the old one can no longer mark this order paid.
  await db.update(payments).set({ provider: gw.id, providerRef: r.providerRef, status: "pending", updatedAt: new Date() }).where(eq(payments.id, p.id));
  await audit({ action: "payment.gateway_return", actorUserId: userId, targetKind: "order", targetId: o.id, requestId, meta: { stage: "initiated", gateway: gw.id } });
  return { redirectUrl: r.redirectUrl };
}

async function applyOrderPayment(provider: GatewayId, providerRef: string, status: GatewayPaymentStatus, amountMinor?: number): Promise<"paid" | "failed" | "ignored"> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(and(eq(payments.provider, provider), eq(payments.providerRef, providerRef))).for("update").limit(1);
    if (!p || p.status === "paid" || p.status === "refunded") return "ignored";
    if (status === "paid") {
      if (amountMinor != null && amountMinor !== p.amountMinor) {
        await tx.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, p.id));
        await audit({ action: "payment.amount_mismatch", targetKind: "order", targetId: p.orderId, meta: { expected: p.amountMinor, got: amountMinor } }, tx);
        return "failed";
      }
      await tx.update(payments).set({ status: "paid", updatedAt: new Date() }).where(eq(payments.id, p.id));
      const [o] = await tx.select({ userId: orders.userId }).from(orders).where(eq(orders.id, p.orderId)).limit(1);
      if (o) await tx.insert(notifications).values({ userId: o.userId, kind: "payment_paid", titleAr: "تم استلام الدفع", titleEn: "Payment received", link: "/orders" });
      return "paid";
    }
    if (status === "failed") {
      await tx.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, p.id));
      return "failed";
    }
    return "ignored";
  });
}

async function apply(provider: GatewayId, ref: { kind: "ord" | "sub"; providerRef: string }, status: GatewayPaymentStatus, amountMinor?: number) {
  return ref.kind === "ord" ? applyOrderPayment(provider, ref.providerRef, status, amountMinor) : applySubscriptionPayment(provider, ref.providerRef, status, amountMinor);
}

/** Parses our own reference ("ord_<uuid>" / "sub_<uuid>"). */
export function parseRef(ref: string | null): { kind: "ord" | "sub"; id: string } | null {
  const m = ref?.match(/^(ord|sub)_([0-9a-f-]{36})$/);
  return m ? { kind: m[1] as "ord" | "sub", id: m[2]! } : null;
}

async function providerRefFor(provider: GatewayId, ref: { kind: "ord" | "sub"; id: string }): Promise<string | null> {
  const db = await getDb();
  if (ref.kind === "ord") {
    const [p] = await db.select({ r: payments.providerRef }).from(payments).where(and(eq(payments.orderId, ref.id), eq(payments.provider, provider))).limit(1);
    return p?.r ?? null;
  }
  const [s] = await db.select({ r: subscriptions.providerRef }).from(subscriptions).where(and(eq(subscriptions.id, ref.id), eq(subscriptions.provider, provider))).limit(1);
  return s?.r ?? null;
}

/**
 * Customer returns from the gateway page. Whatever the query string says, the
 * outcome is re-read from the gateway server-side before anything changes.
 * Returns the in-app path to send the browser to.
 */
export async function handleGatewayReturn(provider: GatewayId, query: URLSearchParams): Promise<string> {
  const ourRef = parseRef(query.get("ref"));
  if (!ourRef) throw new AppError("bad_request", "bad_reference");
  const dest = ourRef.kind === "ord" ? `/orders?payment=` : `/account/billing?payment=`;
  let providerRef = await providerRefFor(provider, ourRef);
  if (provider === "zaincash") {
    const token = query.get("token");
    // No token = the customer cancelled on the ZainCash page.
    if (!token) return `${dest}cancelled`;
    const t = verifyZainCashReturn(token);
    if (t.reference !== `${ourRef.kind}_${ourRef.id}` || (providerRef && t.providerRef !== providerRef)) throw new AppError("bad_request", "reference_mismatch");
    providerRef = t.providerRef;
  }
  if (!providerRef) throw new AppError("not_found");
  let status: GatewayPaymentStatus;
  try {
    status = await GATEWAYS[provider].fetchStatus(providerRef);
  } catch (e) {
    logger.warn({ provider, err: (e as Error).message }, "gateway status check failed on return");
    return `${dest}pending`;
  }
  const outcome = await apply(provider, { kind: ourRef.kind, providerRef }, status);
  await audit({ action: "payment.gateway_return", targetKind: ourRef.kind === "ord" ? "order" : "subscription", targetId: ourRef.id, meta: { provider, status, outcome } });
  return `${dest}${status}`;
}

/** Qi Card server-to-server notification. Signature-verified and idempotent. */
export async function handleQiWebhook(rawBody: string, signature: string | null): Promise<{ ok: true; outcome: string }> {
  const body = verifyQiWebhook(rawBody, signature, env().QI_WEBHOOK_PUBLIC_KEY);
  const db = await getDb();
  const eventId = `${body.paymentId}:${body.status}`;
  const fresh = await db.insert(webhookEvents).values({ provider: "qi_card", eventId, outcome: "received" }).onConflictDoNothing().returning({ id: webhookEvents.id });
  if (!fresh[0]) return { ok: true, outcome: "duplicate" };
  const amount = Math.round(Number(body.amount));
  const [p] = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.provider, "qi_card"), eq(payments.providerRef, body.paymentId))).limit(1);
  const outcome = await apply("qi_card", { kind: p ? "ord" : "sub", providerRef: body.paymentId }, body.mapped, amount);
  await db.update(webhookEvents).set({ outcome }).where(and(eq(webhookEvents.provider, "qi_card"), eq(webhookEvents.eventId, eventId)));
  await audit({ action: "payment.gateway_webhook", targetKind: "payment", targetId: body.paymentId, meta: { provider: "qi_card", status: body.status, outcome } });
  return { ok: true, outcome };
}
