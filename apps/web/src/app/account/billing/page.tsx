import { and, count, eq, gt, isNull } from "drizzle-orm";
import { formatMoney, type CurrencyCode } from "@autocare/contracts";
import { PlanCard, type PlanView } from "@/components/billing/plan-card";
import { Empty, Ltr, Notice, PageHeader, Stamp, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { getDb } from "@/server/db/client";
import { aiUsage, vehicles } from "@/server/db/schema";
import { requireAuth } from "@/server/http/session";
import { billableSubjects, entitlementsFor, mySubscriptions, publicPlans } from "@/server/modules/billing/service";
import { availableGateways } from "@/server/modules/payments/gateways";
import { SubscribeForm } from "./subscribe-form";

export const metadata = { title: "الاشتراك" };

const statusTone = { active: "ok", pending_payment: "warn", pending_manual: "warn", expired: "neutral", cancelled: "neutral", failed: "danger" } as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ plan?: string; payment?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth("/account/billing");
  const { t, locale } = await getDict();
  const uid = auth.user.id;
  const db = await getDb();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [ent, subs, subjects, plans, [veh], [ai]] = await Promise.all([
    entitlementsFor("user", uid),
    mySubscriptions(uid),
    billableSubjects(uid),
    publicPlans(),
    db.select({ n: count() }).from(vehicles).where(and(eq(vehicles.ownerId, uid), isNull(vehicles.deletedAt))),
    db.select({ n: count() }).from(aiUsage).where(and(eq(aiUsage.userId, uid), eq(aiUsage.kind, "diagnosis"), eq(aiUsage.status, "ok"), gt(aiUsage.createdAt, monthStart))),
  ]);
  const paid = (plans as PlanView[]).filter((p) => p.tier === "paid");
  const selected = paid.find((p) => p.id === sp.plan) ?? null;
  const gateways = availableGateways().map((g) => ({ id: g.id, name: locale === "ar" ? g.nameAr : g.nameEn, minAmountIqd: g.minAmountIqd }));
  const paymentMsg = sp.payment && sp.payment in t.billing.paymentResult ? t.billing.paymentResult[sp.payment as keyof typeof t.billing.paymentResult] : null;
  const meter = (used: number, max: number | undefined) => (
    <div className="mt-1 h-2 w-full overflow-hidden bg-paper-2" aria-hidden="true">
      <div className="h-full bg-signal" style={{ width: `${Math.min(100, max ? (used / max) * 100 : 0)}%` }} />
    </div>
  );

  return (
    <>
      <PageHeader title={t.billing.billingTitle} lead={t.billing.alwaysFree} />
      {paymentMsg ? <Notice tone={sp.payment === "paid" ? "ok" : sp.payment === "failed" ? "danger" : "info"}>{paymentMsg}</Notice> : null}

      <section className="ticket">
        <div className="ticket-head"><span>{t.billing.usage}</span><span dir="ltr">{ent.planId.toUpperCase()}</span></div>
        <dl className="grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-ink-3">{t.garage.title}</dt>
            <dd className="font-display text-2xl font-bold" dir="ltr">{Number(veh?.n ?? 0)} / {ent.maxVehicles ?? "∞"}</dd>
            {meter(Number(veh?.n ?? 0), ent.maxVehicles)}
          </div>
          <div>
            <dt className="text-sm text-ink-3">{t.billing.ent.aiExplanationsPerMonth.replace("{n} ", "")}</dt>
            <dd className="font-display text-2xl font-bold" dir="ltr">{Number(ai?.n ?? 0)} / {ent.aiExplanationsPerMonth ?? "∞"}</dd>
            {meter(Number(ai?.n ?? 0), ent.aiExplanationsPerMonth)}
          </div>
        </dl>
      </section>

      {selected ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <PlanCard p={selected} t={t} locale={locale} />
          <SubscribeForm
            plan={{ id: selected.id, audience: selected.audience, priceMinor: selected.priceMinor ?? 0 }}
            gateways={gateways}
            subjects={{
              merchants: subjects.merchants.map((m) => ({ id: m.id, name: m.name })),
              workshops: subjects.workshops.map((w) => ({ id: w.id, name: w.name })),
            }}
          />
        </div>
      ) : paid.length ? (
        <ul className="grid gap-5 md:grid-cols-2">
          {(paid.filter((p) => p.audience === "owner").length ? paid.filter((p) => p.audience === "owner") : paid).map((p) => (
            <li key={p.id}>
              <PlanCard p={p} t={t} locale={locale} current={ent.planId === p.id} action={<a href={`/account/billing?plan=${p.id}`} className="btn btn-primary w-full">{t.billing.choose}</a>} />
            </li>
          ))}
        </ul>
      ) : (
        <Notice tone="info">{t.billing.priceNotSet}</Notice>
      )}

      <section>
        <h2 className="label-mono mb-2">{t.billing.history}</h2>
        {subs.length ? (
          <ul className="ticket divide-y divide-dashed divide-rule">
            {subs.map(({ s, p }) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{locale === "ar" ? p.nameAr : p.nameEn}</p>
                  <p className="text-xs text-ink-3">
                    {fmtDate(s.createdAt, locale)} · <Ltr>{s.provider}</Ltr>
                    {s.periodEnd && s.status === "active" ? <> · {t.billing.until} {fmtDate(s.periodEnd, locale)}</> : null}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{formatMoney(s.amountMinor, s.currency as CurrencyCode, locale)}</span>
                  <Stamp tone={statusTone[s.status]}>{t.billing.status[s.status]}</Stamp>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t.billing.none}</Empty>
        )}
      </section>
    </>
  );
}
