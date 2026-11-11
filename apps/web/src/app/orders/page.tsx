import { formatMoney, type CurrencyCode } from "@autocare/contracts";
import { Container, Empty, Notice, PageHeader, Stamp, fmtDate } from "@/components/ui/bits";
import { PayButton } from "./pay-button";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { myOrders } from "@/server/modules/market/service";
import { SubOrderActions } from "./sub-order-actions";

export const metadata = { title: "طلباتي" };

const tone = { pending: "info", confirmed: "info", shipped: "warn", delivered: "ok", cancelled: "neutral", return_requested: "warn", returned: "neutral" } as const;

const payTone = { pending: "warn", authorized: "info", paid: "ok", failed: "danger", refunded: "neutral" } as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const sp = await searchParams;
  const auth = await requireAuth("/orders");
  const { t, locale } = await getDict();
  const orders = await myOrders(auth.user.id);
  return (
    <Container>
      <PageHeader title={t.market.orders} />
      {sp.payment && sp.payment in t.billing.paymentResult ? (
        <div className="mb-5"><Notice tone={sp.payment === "paid" ? "ok" : sp.payment === "failed" ? "danger" : "info"}>{t.billing.paymentResult[sp.payment as keyof typeof t.billing.paymentResult]}</Notice></div>
      ) : null}
      {orders.length === 0 ? <Empty>{t.common.empty}</Empty> : null}
      <div className="space-y-5">
        {orders.map((o) => (
          <article key={o.id} className="ticket">
            <div className="ticket-head">
              <span>{fmtDate(o.createdAt, locale, true)} · {o.paymentMethod === "cod" ? t.market.cod : o.paymentMethod === "test_gateway" ? t.market.testGateway : o.paymentMethod === "qi_card" ? "Qi Card" : "ZainCash"}</span>
              <span dir="ltr">ORD-{o.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="divide-y divide-dashed divide-rule">
              {o.merchantOrders.map((mo) => (
                <section key={mo.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{mo.merchantName}</p>
                      <Stamp tone={tone[mo.status]}>{mo.status}</Stamp>
                    </div>
                    <ul className="mt-1 text-sm text-ink-2">{mo.items.map((i) => <li key={i.id}>{i.titleSnapshot} × {i.quantity} — {formatMoney(i.unitPriceMinor * i.quantity, mo.currency as CurrencyCode, locale)}</li>)}</ul>
                    <ol className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-3">{mo.statusHistory.map((h, i) => <li key={i}>{h.status} · {fmtDate(h.at, locale, true)}</li>)}</ol>
                  </div>
                  <SubOrderActions id={mo.id} status={mo.status} />
                </section>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-3 font-semibold">
              <span>{t.market.total}</span>
              <span className="flex flex-wrap items-center gap-3">
                {formatMoney(o.totalMinor, o.currency as CurrencyCode, locale)}
                {o.payment ? <Stamp tone={payTone[o.payment.status]}>{t.market.payStatus[o.payment.status]}</Stamp> : null}
                {(o.paymentMethod === "qi_card" || o.paymentMethod === "zaincash") && o.payment && (o.payment.status === "pending" || o.payment.status === "failed") && o.merchantOrders.some((m) => m.status !== "cancelled") ? <PayButton orderId={o.id} /> : null}
              </span>
            </div>
          </article>
        ))}
      </div>
    </Container>
  );
}
