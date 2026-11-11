import "server-only";
import { and, count, desc, eq, gt, inArray, isNull, sql, sum } from "drizzle-orm";
import { env } from "../../config/env";
import { getDb, type Tx } from "../../db/client";
import {
  aiUsage, commissionEntries, merchantMembers, merchantOrders, merchants, notifications, plans, subscriptions, vehicles, workshopMembers, workshops,
  type PlanEntitlements,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { audit } from "../audit/audit";
import { GATEWAYS, type GatewayId, type GatewayPaymentStatus } from "../payments/gateways";

type Plan = typeof plans.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;
export type Audience = Plan["audience"];
export type SubjectKind = Subscription["subjectKind"];

/**
 * Free-tier entitlements, used when no paid plan is active (and as the
 * fallback if the plan rows were never seeded). Paid plans override fields.
 * Safety content and the deterministic urgency verdict are never limited.
 */
export const FREE_ENTITLEMENTS: Record<Audience, Required<Pick<PlanEntitlements, never>> & PlanEntitlements> = {
  owner: { maxVehicles: 3, aiExplanationsPerMonth: 20 },
  workshop: { featuredListing: false, analytics: false },
  merchant: { commissionBps: 800, sponsoredProducts: 0, offerResponsesPerMonth: 30, analytics: false },
};

const audienceOf = (k: SubjectKind): Audience => (k === "user" ? "owner" : k);

/** Plan catalogue seeded with NO price: the operator sets prices and publishes in the admin panel. */
export const PLAN_SEED: Array<Omit<typeof plans.$inferInsert, "updatedAt">> = [
  { id: "owner_free", audience: "owner", tier: "free", nameAr: "مجاني", nameEn: "Free", descriptionAr: "تفسير الأكواد ودليل الأعطال والتشخيص الإرشادي مع حدود شهرية للشرح الذكي.", descriptionEn: "Code meanings, fault guides and guided diagnosis, with a monthly limit on AI explanations.", priceMinor: 0, entitlements: FREE_ENTITLEMENTS.owner, published: true, sortOrder: 0 },
  { id: "owner_pro", audience: "owner", tier: "paid", nameAr: "برو", nameEn: "Pro", descriptionAr: "لأكثر من سيارة وللعائلات وأصحاب السيارات الذين يشخّصون كثيرًا.", descriptionEn: "For several cars, families and owners who diagnose often.", priceMinor: null, entitlements: { maxVehicles: 15, aiExplanationsPerMonth: 300 }, published: false, sortOrder: 1 },
  { id: "workshop_free", audience: "workshop", tier: "free", nameAr: "ورشة — أساسي", nameEn: "Workshop — Basic", descriptionAr: "الظهور في دليل الورش واستقبال المواعيد والتقارير المشاركة.", descriptionEn: "Directory listing, appointments and shared reports.", priceMinor: 0, entitlements: FREE_ENTITLEMENTS.workshop, published: true, sortOrder: 10 },
  { id: "workshop_featured", audience: "workshop", tier: "paid", nameAr: "ورشة — مميزة", nameEn: "Workshop — Featured", descriptionAr: "ظهور في قسم «ورش مميزة» (معلَّم بوضوح) وإحصاءات الحجوزات.", descriptionEn: "A clearly labelled “Featured workshops” slot and booking analytics.", priceMinor: null, entitlements: { featuredListing: true, analytics: true }, published: false, sortOrder: 11 },
  { id: "merchant_free", audience: "merchant", tier: "free", nameAr: "تاجر — أساسي", nameEn: "Merchant — Basic", descriptionAr: "عرض المنتجات والرد على طلبات التسعير مع عمولة على الطلبات المسلَّمة.", descriptionEn: "List products and answer quote requests, with a commission on delivered orders.", priceMinor: 0, entitlements: FREE_ENTITLEMENTS.merchant, published: true, sortOrder: 20 },
  { id: "merchant_pro", audience: "merchant", tier: "paid", nameAr: "تاجر — برو", nameEn: "Merchant — Pro", descriptionAr: "عمولة أقل، ومنتجات «ممولة» معلَّمة بوضوح، وردود أكثر على طلبات التسعير، وإحصاءات.", descriptionEn: "Lower commission, clearly labelled sponsored products, more quote responses and analytics.", priceMinor: null, entitlements: { commissionBps: 500, sponsoredProducts: 10, offerResponsesPerMonth: 1000, analytics: true }, published: false, sortOrder: 21 },
];

export async function seedPlans(db: Tx | Awaited<ReturnType<typeof getDb>>): Promise<void> {
  for (const p of PLAN_SEED) await db.insert(plans).values(p).onConflictDoNothing();
}

// ---------------- read side ----------------

export async function publicPlans(): Promise<Plan[]> {
  const db = await getDb();
  const rows = await db.select().from(plans).where(eq(plans.published, true)).orderBy(plans.sortOrder);
  // A paid plan without a price is never shown, even if someone ticked "published".
  return rows.filter((p) => p.tier === "free" || (p.priceMinor != null && p.priceMinor > 0));
}

type Exec = Tx | Awaited<ReturnType<typeof getDb>>;

export async function activeSubscription(kind: SubjectKind, subjectId: string, at = new Date(), exec?: Exec): Promise<(Subscription & { plan: Plan }) | null> {
  const db = exec ?? (await getDb());
  const [row] = await db
    .select({ s: subscriptions, p: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.subjectKind, kind), eq(subscriptions.subjectId, subjectId), eq(subscriptions.status, "active"), gt(subscriptions.periodEnd, at)))
    .orderBy(desc(subscriptions.periodEnd))
    .limit(1);
  return row ? { ...row.s, plan: row.p } : null;
}

/** Pass `exec` when called inside a transaction (one connection; avoids self-deadlock on PGlite). */
export async function entitlementsFor(kind: SubjectKind, subjectId: string, exec?: Exec): Promise<PlanEntitlements & { planId: string }> {
  const audience = audienceOf(kind);
  const db = exec ?? (await getDb());
  const [free] = await db.select().from(plans).where(and(eq(plans.audience, audience), eq(plans.tier, "free"))).limit(1);
  const base = { ...FREE_ENTITLEMENTS[audience], ...(free?.entitlements ?? {}) };
  const sub = await activeSubscription(kind, subjectId, new Date(), db);
  return sub ? { ...base, ...sub.plan.entitlements, planId: sub.planId } : { ...base, planId: free?.id ?? `${audience}_free` };
}

/** Same as entitlementsFor but for many subjects at once (directory/catalog rendering). */
export async function activePaidSubjects(kind: SubjectKind, ids: string[], flag: keyof PlanEntitlements): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const db = await getDb();
  const rows = await db
    .select({ id: subscriptions.subjectId, e: plans.entitlements })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.subjectKind, kind), inArray(subscriptions.subjectId, ids), eq(subscriptions.status, "active"), gt(subscriptions.periodEnd, new Date())));
  return new Set(rows.filter((r) => Boolean(r.e[flag])).map((r) => r.id));
}

// ---------------- enforcement ----------------

export async function assertVehicleAllowance(userId: string): Promise<void> {
  const db = await getDb();
  const ent = await entitlementsFor("user", userId);
  const [row] = await db.select({ n: count() }).from(vehicles).where(and(eq(vehicles.ownerId, userId), isNull(vehicles.deletedAt)));
  if ((row?.n ?? 0) >= (ent.maxVehicles ?? Infinity)) throw new AppError("plan_limit", "max_vehicles", { fields: { plan: [ent.planId] } });
}

/** Monthly AI-explanation allowance. Exceeding it never blocks the rules-based result. */
export async function assertAiAllowance(userId: string): Promise<void> {
  const db = await getDb();
  const ent = await entitlementsFor("user", userId);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db.select({ n: count() }).from(aiUsage).where(and(eq(aiUsage.userId, userId), eq(aiUsage.kind, "diagnosis"), eq(aiUsage.status, "ok"), gt(aiUsage.createdAt, monthStart)));
  if ((row?.n ?? 0) >= (ent.aiExplanationsPerMonth ?? Infinity)) throw new AppError("plan_limit", "ai_monthly_allowance");
}

// ---------------- subscriptions ----------------

async function assertSubjectOwner(userId: string, kind: SubjectKind, subjectId: string): Promise<void> {
  const db = await getDb();
  if (kind === "user") {
    if (subjectId !== userId) throw new AppError("forbidden");
    return;
  }
  if (kind === "merchant") {
    const [m] = await db.select({ id: merchants.id }).from(merchants).innerJoin(merchantMembers, eq(merchantMembers.merchantId, merchants.id))
      .where(and(eq(merchants.id, subjectId), eq(merchantMembers.userId, userId), eq(merchantMembers.role, "owner"), eq(merchants.status, "approved"))).limit(1);
    if (!m) throw new AppError("forbidden", "not_merchant_owner");
    return;
  }
  const [w] = await db.select({ id: workshops.id }).from(workshops).innerJoin(workshopMembers, eq(workshopMembers.workshopId, workshops.id))
    .where(and(eq(workshops.id, subjectId), eq(workshopMembers.userId, userId), eq(workshopMembers.role, "owner"), eq(workshops.status, "approved"))).limit(1);
  if (!w) throw new AppError("forbidden", "not_workshop_owner");
}

export interface StartSubscriptionResult {
  subscriptionId: string;
  status: Subscription["status"];
  redirectUrl: string | null;
}

/**
 * Starts a paid plan. With an online gateway the user is redirected to the
 * gateway's hosted page; with "manual" the request waits for an admin to
 * confirm cash/transfer receipt. Activation happens only after confirmation.
 */
export async function startSubscription(
  userId: string,
  input: { planId: string; subjectKind: SubjectKind; subjectId: string; method: GatewayId | "manual"; locale: "ar" | "en" },
  requestId?: string,
): Promise<StartSubscriptionResult> {
  const db = await getDb();
  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  if (!plan || !plan.published || plan.tier !== "paid" || plan.priceMinor == null || plan.priceMinor <= 0) throw new AppError("not_found", "plan_not_available");
  if (audienceOf(input.subjectKind) !== plan.audience) throw new AppError("bad_request", "plan_audience_mismatch");
  await assertSubjectOwner(userId, input.subjectKind, input.subjectId);

  // One open request per subject at a time.
  const [open] = await db.select({ id: subscriptions.id }).from(subscriptions)
    .where(and(eq(subscriptions.subjectKind, input.subjectKind), eq(subscriptions.subjectId, input.subjectId), inArray(subscriptions.status, ["pending_payment", "pending_manual"]))).limit(1);
  if (open) throw new AppError("conflict", "subscription_request_pending");

  const id = crypto.randomUUID();
  if (input.method === "manual") {
    await db.insert(subscriptions).values({ id, planId: plan.id, subjectKind: input.subjectKind, subjectId: input.subjectId, userId, status: "pending_manual", provider: "manual", amountMinor: plan.priceMinor, currency: plan.currency });
    await audit({ action: "subscription.requested", actorUserId: userId, targetKind: "subscription", targetId: id, requestId, meta: { plan: plan.id, method: "manual" } });
    return { subscriptionId: id, status: "pending_manual", redirectUrl: null };
  }

  const gw = GATEWAYS[input.method];
  if (!gw?.configured()) throw new AppError("provider_not_configured", input.method);
  const origin = env().APP_ORIGIN;
  await db.insert(subscriptions).values({ id, planId: plan.id, subjectKind: input.subjectKind, subjectId: input.subjectId, userId, status: "pending_payment", provider: gw.id, amountMinor: plan.priceMinor, currency: plan.currency });
  try {
    const r = await gw.createPayment({
      reference: `sub_${id}`,
      amountIqd: plan.priceMinor,
      locale: input.locale,
      returnUrl: `${origin}/api/v1/payments/${gw.id}/return?ref=sub_${id}`,
      notifyUrl: `${origin}/api/v1/webhooks/${gw.id === "qi_card" ? "qi-card" : gw.id}`,
      serviceType: `AutoCare ${plan.nameEn}`,
    });
    await db.update(subscriptions).set({ providerRef: r.providerRef, updatedAt: new Date() }).where(eq(subscriptions.id, id));
    await audit({ action: "subscription.requested", actorUserId: userId, targetKind: "subscription", targetId: id, requestId, meta: { plan: plan.id, method: gw.id } });
    return { subscriptionId: id, status: "pending_payment", redirectUrl: r.redirectUrl };
  } catch (e) {
    await db.update(subscriptions).set({ status: "failed", note: "gateway_init_failed", updatedAt: new Date() }).where(eq(subscriptions.id, id));
    throw e;
  }
}

async function activate(tx: Tx, sub: Subscription, by: string | null): Promise<void> {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
  if (!plan) throw new AppError("not_found");
  // Stack on top of a still-running period instead of discarding paid days.
  const [current] = await tx.select({ end: subscriptions.periodEnd }).from(subscriptions)
    .where(and(eq(subscriptions.subjectKind, sub.subjectKind), eq(subscriptions.subjectId, sub.subjectId), eq(subscriptions.status, "active"), gt(subscriptions.periodEnd, new Date())))
    .orderBy(desc(subscriptions.periodEnd)).limit(1);
  const start = current?.end && current.end > new Date() ? current.end : new Date();
  const end = new Date(start.getTime() + plan.periodDays * 86_400_000);
  await tx.update(subscriptions).set({ status: "active", periodStart: start, periodEnd: end, activatedBy: by, updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
  await tx.insert(notifications).values({ userId: sub.userId, kind: "subscription_active", titleAr: `تم تفعيل باقة ${plan.nameAr}`, titleEn: `${plan.nameEn} plan activated`, link: "/account/billing" });
}

/** Admin confirms a cash/transfer payment. Reauth + MFA enforced at the route. */
export async function confirmManualSubscription(adminId: string, subscriptionId: string, note: string | undefined, requestId?: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).for("update").limit(1);
    if (!sub) throw new AppError("not_found");
    if (sub.status !== "pending_manual") throw new AppError("conflict", "not_pending_manual");
    await activate(tx, sub, adminId);
    if (note) await tx.update(subscriptions).set({ note: note.slice(0, 500) }).where(eq(subscriptions.id, sub.id));
    await audit({ action: "subscription.manual_confirmed", actorUserId: adminId, targetKind: "subscription", targetId: sub.id, requestId, meta: { plan: sub.planId, amount: sub.amountMinor } }, tx);
  });
}

export async function rejectManualSubscription(adminId: string, subscriptionId: string, requestId?: string): Promise<void> {
  const db = await getDb();
  const r = await db.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.status, "pending_manual"))).returning({ id: subscriptions.id });
  if (!r[0]) throw new AppError("conflict", "not_pending_manual");
  await audit({ action: "subscription.manual_rejected", actorUserId: adminId, targetKind: "subscription", targetId: subscriptionId, requestId });
}

/** Applies a gateway-confirmed status to a subscription (idempotent). */
export async function applySubscriptionPayment(provider: GatewayId, providerRef: string, status: GatewayPaymentStatus, amountMinor?: number): Promise<"activated" | "failed" | "ignored"> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(and(eq(subscriptions.provider, provider), eq(subscriptions.providerRef, providerRef))).for("update").limit(1);
    if (!sub || sub.status !== "pending_payment") return "ignored";
    if (status === "paid") {
      if (amountMinor != null && amountMinor !== sub.amountMinor) {
        await tx.update(subscriptions).set({ status: "failed", note: "amount_mismatch", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
        await audit({ action: "subscription.amount_mismatch", targetKind: "subscription", targetId: sub.id, meta: { expected: sub.amountMinor, got: amountMinor } }, tx);
        return "failed";
      }
      await activate(tx, sub, null);
      await audit({ action: "subscription.paid", targetKind: "subscription", targetId: sub.id, meta: { provider } }, tx);
      return "activated";
    }
    if (status === "failed") {
      await tx.update(subscriptions).set({ status: "failed", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
      return "failed";
    }
    return "ignored";
  });
}

export async function mySubscriptions(userId: string) {
  const db = await getDb();
  return db.select({ s: subscriptions, p: plans }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(50);
}

/** Businesses this user may buy a plan for. */
export async function billableSubjects(userId: string) {
  const db = await getDb();
  const ms = await db.select({ id: merchants.id, name: merchants.name }).from(merchants).innerJoin(merchantMembers, eq(merchantMembers.merchantId, merchants.id))
    .where(and(eq(merchantMembers.userId, userId), eq(merchantMembers.role, "owner"), eq(merchants.status, "approved")));
  const ws = await db.select({ id: workshops.id, name: workshops.name }).from(workshops).innerJoin(workshopMembers, eq(workshopMembers.workshopId, workshops.id))
    .where(and(eq(workshopMembers.userId, userId), eq(workshopMembers.role, "owner"), eq(workshops.status, "approved")));
  return { merchants: ms, workshops: ws };
}

// ---------------- commission ledger ----------------

/** Called inside the order-status transaction when a merchant order is delivered. */
export async function accrueCommission(tx: Tx, mo: typeof merchantOrders.$inferSelect): Promise<void> {
  const ent = await entitlementsFor("merchant", mo.merchantId, tx);
  const rateBps = Math.max(0, Math.min(3000, ent.commissionBps ?? FREE_ENTITLEMENTS.merchant.commissionBps!));
  // Commission on goods only; delivery fees pass through to the merchant.
  const amount = Math.round((mo.subtotalMinor * rateBps) / 10_000);
  await tx.insert(commissionEntries).values({ merchantOrderId: mo.id, merchantId: mo.merchantId, baseMinor: mo.subtotalMinor, rateBps, amountMinor: amount, currency: mo.currency }).onConflictDoNothing();
}

/** A returned order voids its (not yet settled) commission. */
export async function voidCommission(tx: Tx, merchantOrderId: string): Promise<void> {
  await tx.update(commissionEntries).set({ status: "void", updatedAt: new Date() }).where(and(eq(commissionEntries.merchantOrderId, merchantOrderId), inArray(commissionEntries.status, ["accrued", "invoiced"])));
}

export async function merchantStatement(merchantId: string) {
  const db = await getDb();
  const entries = await db.select().from(commissionEntries).where(eq(commissionEntries.merchantId, merchantId)).orderBy(desc(commissionEntries.createdAt)).limit(200);
  const totals = await db.select({ status: commissionEntries.status, base: sum(commissionEntries.baseMinor), amount: sum(commissionEntries.amountMinor) }).from(commissionEntries)
    .where(eq(commissionEntries.merchantId, merchantId)).groupBy(commissionEntries.status);
  return { entries, totals: totals.map((t) => ({ status: t.status, baseMinor: Number(t.base ?? 0), amountMinor: Number(t.amount ?? 0) })) };
}

// ---------------- admin ----------------

export async function adminPlans(): Promise<Plan[]> {
  const db = await getDb();
  return db.select().from(plans).orderBy(plans.sortOrder);
}

export async function adminUpdatePlan(adminId: string, planId: string, patch: { priceMinor?: number | null; published?: boolean; entitlements?: PlanEntitlements; periodDays?: number }, requestId?: string): Promise<Plan> {
  const db = await getDb();
  const [cur] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!cur) throw new AppError("not_found");
  const next = { ...cur, ...patch };
  if (next.tier === "paid" && next.published && (next.priceMinor == null || next.priceMinor <= 0)) throw new AppError("validation_failed", "price_required", { fields: { priceMinor: ["required"] } });
  if (next.tier === "free" && (next.priceMinor ?? 0) !== 0) throw new AppError("validation_failed", "free_plan_price", { fields: { priceMinor: ["must_be_zero"] } });
  const [row] = await db.update(plans).set({ ...patch, updatedBy: adminId, updatedAt: new Date() }).where(eq(plans.id, planId)).returning();
  await audit({ action: "plan.updated", actorUserId: adminId, targetKind: "plan", targetId: planId, requestId, meta: { before: { price: cur.priceMinor, published: cur.published }, after: { price: row!.priceMinor, published: row!.published } } });
  return row!;
}

export async function adminSubscriptions(status?: Subscription["status"]) {
  const db = await getDb();
  return db.select({ s: subscriptions, p: plans }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(status ? eq(subscriptions.status, status) : undefined).orderBy(desc(subscriptions.createdAt)).limit(200);
}

/** Revenue figures straight from the ledgers — no projections. */
export async function revenueSummary(sinceDays = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const subs = await db.select({ provider: subscriptions.provider, n: count(), amount: sum(subscriptions.amountMinor) }).from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), gt(subscriptions.periodStart, since))).groupBy(subscriptions.provider);
  const activeNow = await db.select({ planId: subscriptions.planId, n: count() }).from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), gt(subscriptions.periodEnd, new Date()))).groupBy(subscriptions.planId);
  const comm = await db.select({ status: commissionEntries.status, n: count(), base: sum(commissionEntries.baseMinor), amount: sum(commissionEntries.amountMinor) }).from(commissionEntries)
    .where(gt(commissionEntries.createdAt, since)).groupBy(commissionEntries.status);
  const pendingManual = await db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.status, "pending_manual"));
  const gmv = await db.select({ amount: sum(merchantOrders.subtotalMinor) }).from(merchantOrders).where(and(eq(merchantOrders.status, "delivered"), gt(merchantOrders.updatedAt, since)));
  return {
    sinceDays,
    currency: "IQD",
    subscriptionRevenue: subs.map((s) => ({ provider: s.provider, count: Number(s.n), amountMinor: Number(s.amount ?? 0) })),
    activeSubscriptions: activeNow.map((a) => ({ planId: a.planId, count: Number(a.n) })),
    commission: comm.map((c) => ({ status: c.status, count: Number(c.n), baseMinor: Number(c.base ?? 0), amountMinor: Number(c.amount ?? 0) })),
    deliveredGmvMinor: Number(gmv[0]?.amount ?? 0),
    pendingManualRequests: Number(pendingManual[0]?.n ?? 0),
  };
}

/** Expires lapsed subscriptions (run from the retention job; reads already ignore them). */
export async function expireLapsed(): Promise<number> {
  const db = await getDb();
  const r = await db.update(subscriptions).set({ status: "expired", updatedAt: new Date() }).where(and(eq(subscriptions.status, "active"), sql`${subscriptions.periodEnd} <= now()`)).returning({ id: subscriptions.id });
  return r.length;
}
