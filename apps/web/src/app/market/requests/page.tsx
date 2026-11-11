import { formatMoney, IQ_GOVERNORATES, type CurrencyCode } from "@autocare/contracts";
import { Container, Empty, Ltr, PageHeader, Stamp, fmtDate } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { requireAuth } from "@/server/http/session";
import { myOfferRequests } from "@/server/modules/market/service";
import { listVehicles } from "@/server/modules/vehicles/service";
import { AddOfferToCart, RequestForm } from "./request-form";

export const metadata = { title: "طلبات عروض الأسعار" };

export default async function RequestsPage() {
  const auth = await requireAuth("/market/requests");
  const { t, locale } = await getDict();
  const [vehicles, requests] = await Promise.all([listVehicles(auth.user.id), myOfferRequests(auth.user.id)]);
  const govName = (c: string) => IQ_GOVERNORATES.find((g) => g.code === c)?.[locale] ?? c;
  return (
    <Container>
      <PageHeader title={t.market.requests} lead={t.home.t2Body} />
      <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr]">
        <section className="ticket self-start">
          <div className="ticket-head"><span>{t.market.newRequest}</span><span dir="ltr">RFQ</span></div>
          <div className="p-5">
            {vehicles.length ? <RequestForm vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.make} ${v.model} ${v.year}` }))} /> : <p className="text-ink-2">{t.diagnose.needVehicle}</p>}
          </div>
        </section>
        <div className="space-y-4">
          {requests.length === 0 ? <Empty>{t.common.empty}</Empty> : null}
          {requests.map((r) => (
            <article key={r.id} className="ticket">
              <div className="ticket-head"><span>{govName(r.governorate)}</span><span>{fmtDate(r.createdAt, locale)}</span></div>
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-bold">{r.partDescription} <span className="text-sm font-normal text-ink-3">× {r.quantity}</span></p>
                  <Stamp tone={r.status === "open" ? "info" : "neutral"}>{r.status}</Stamp>
                </div>
                <p className="text-sm text-ink-3">{String(r.vehicleSnapshot.make)} {String(r.vehicleSnapshot.model)} {String(r.vehicleSnapshot.year)}{r.oeNumber ? <> · OE <Ltr>{r.oeNumber}</Ltr></> : null}</p>
                <h3 className="label-mono mb-2 mt-4">{t.market.offers}</h3>
                {r.offers.length === 0 ? (
                  <p className="text-sm text-ink-3">{t.market.noOffers}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink">
                        <th className="py-1 text-start">{t.market.seller}</th><th className="text-start">{t.market.total}</th><th className="text-start">{t.market.warranty}</th><th className="text-start">{t.market.eta}</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {r.offers.map((o, i) => (
                        <tr key={o.id} className={`border-b border-dashed border-rule ${i === 0 ? "bg-ok-soft" : ""}`}>
                          <td className="py-2">{o.merchantName}<br /><span className="text-xs text-ink-3">{t.market.condition[o.condition]}</span></td>
                          <td>{formatMoney(o.priceMinor + o.deliveryFeeMinor, o.currency as CurrencyCode, locale)}<br /><span className="text-xs text-ink-3">{t.market.delivery}: {formatMoney(o.deliveryFeeMinor, o.currency as CurrencyCode, locale)}</span></td>
                          <td><Ltr>{o.warrantyDays}</Ltr> {t.market.days}</td>
                          <td><Ltr>{o.etaDays}</Ltr> {t.market.days}</td>
                          <td>{o.status === "submitted" ? <AddOfferToCart offerId={o.id} /> : <Stamp tone="neutral">{o.status}</Stamp>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </Container>
  );
}
