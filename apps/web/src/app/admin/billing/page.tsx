import { formatMoney } from "@autocare/contracts";
import { Ltr, PageHeader, Stamp, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requirePermission } from "@/server/http/session";
import { adminPlans, adminSubscriptions, revenueSummary } from "@/server/modules/billing/service";
import { gatewayStatuses } from "@/server/modules/payments/gateways";
import { ManualRequests, PlansEditor } from "./billing-panels";

export const metadata = { title: "الإيرادات" };

export default async function AdminBillingPage() {
  const auth = await requirePermission("admin:billing", "/admin/billing");
  const { t, locale } = await getDict();
  const [rev, plans, pending] = await Promise.all([revenueSummary(30), adminPlans(), adminSubscriptions("pending_manual")]);
  const money = (n: number) => formatMoney(n, "IQD", locale);
  const subsTotal = rev.subscriptionRevenue.reduce((a, s) => a + s.amountMinor, 0);
  const commAccrued = rev.commission.filter((c) => c.status !== "void").reduce((a, c) => a + c.amountMinor, 0);
  const gw = gatewayStatuses();

  return (
    <div className="space-y-8">
      <PageHeader title={t.billing.adminTitle} lead={t.billing.revenue.replace("{days}", String(rev.sinceDays))} />
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { k: t.billing.subsRevenue, v: money(subsTotal) },
          { k: t.billing.commissionAccrued, v: money(commAccrued) },
          { k: t.billing.gmv, v: money(rev.deliveredGmvMinor) },
          { k: t.billing.pendingManual, v: String(rev.pendingManualRequests) },
        ].map((x) => (
          <div key={x.k} className="ticket p-4">
            <dt className="label-mono">{x.k}</dt>
            <dd className="font-display text-2xl font-bold">{x.v}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="label-mono mb-2">{t.billing.activeSubs}</h2>
        <ul className="flex flex-wrap gap-2">
          {rev.activeSubscriptions.length ? rev.activeSubscriptions.map((a) => <li key={a.planId}><Stamp tone="ok"><Ltr>{a.planId}</Ltr> · {a.count}</Stamp></li>) : <li className="text-sm text-ink-3">{t.common.empty}</li>}
        </ul>
      </section>

      <section>
        <h2 className="label-mono mb-2">{t.billing.pendingManual}</h2>
        <ManualRequests
          mfaEnabled={auth.user.mfaEnabled}
          items={pending.map(({ s, p }) => ({ id: s.id, plan: locale === "ar" ? p.nameAr : p.nameEn, subjectKind: s.subjectKind, subjectId: s.subjectId, amount: money(s.amountMinor), createdAt: fmtDate(s.createdAt, locale, true) }))}
        />
      </section>

      <section>
        <h2 className="label-mono mb-2">{t.billing.plansEditor}</h2>
        <p className="mb-3 text-sm text-ink-3">{t.billing.priceHint}</p>
        <PlansEditor mfaEnabled={auth.user.mfaEnabled} plans={plans.map((p) => ({ id: p.id, tier: p.tier, name: locale === "ar" ? p.nameAr : p.nameEn, priceMinor: p.priceMinor, published: p.published, periodDays: p.periodDays }))} />
      </section>

      <section>
        <h2 className="label-mono mb-2">{t.billing.gateways}</h2>
        <ul className="ticket divide-y divide-dashed divide-rule">
          {gw.map((g) => (
            <li key={g.id} className="grid gap-1 p-4 sm:grid-cols-[12rem_auto_1fr] sm:items-center sm:gap-4">
              <span className="font-semibold">{g.name}</span>
              <Stamp tone={g.state === "configured" ? "ok" : g.state === "not_configured" ? "warn" : "neutral"}>{t.billing.gatewayState[g.state as keyof typeof t.billing.gatewayState]}</Stamp>
              <span className="text-xs text-ink-3" dir="ltr">{g.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
