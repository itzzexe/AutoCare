import { notFound } from "next/navigation";
import { formatMoney, type CurrencyCode } from "@autocare/contracts";
import { Container, Ltr, Notice, Stamp } from "@/components/ui/bits";
import { getDict } from "@/i18n/server";
import { currentAuth } from "@/server/http/session";
import { productDetail, publicReviews } from "@/server/modules/market/service";
import { getOwnedVehicle } from "@/server/modules/vehicles/service";
import { AddToCart } from "./add-to-cart";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vehicleId?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { t, locale } = await getDict();
  const auth = await currentAuth();
  const v = auth && sp.vehicleId && /^[0-9a-f-]{36}$/.test(sp.vehicleId) ? await getOwnedVehicle(auth.user.id, sp.vehicleId).catch(() => null) : null;
  const p = await productDetail(id, v ? { make: v.make, model: v.model, year: v.year, engine: v.engine } : undefined).catch(() => null);
  if (!p) notFound();
  const reviews = await publicReviews("merchant", p.merchant.id);
  const fitTone = { compatible_per_source: "ok", seller_claim: "warn", needs_confirmation: "neutral" } as const;
  const srcLabel = { provider: locale === "ar" ? "كتالوج مرخّص" : "Licensed catalogue", moderator_verified: locale === "ar" ? "تحقق المشرف" : "Moderator verified", merchant_claim: locale === "ar" ? "ادعاء البائع" : "Seller claim" } as const;

  return (
    <Container>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <article className="ticket">
          <div className="ticket-head"><span>{p.category}</span>{p.sponsored ? <span className="text-signal">{t.market.sponsored}</span> : <span dir="ltr">{p.brand}</span>}</div>
          <div className="space-y-5 p-6">
            <h1 className="text-3xl font-bold">{locale === "ar" ? p.titleAr : p.titleEn ?? p.titleAr}</h1>
            <div className="flex flex-wrap gap-2">
              <Stamp tone={fitTone[p.fitment]}>{t.market.fitment[p.fitment]}</Stamp>
              <Stamp tone="neutral">{t.market.condition[p.condition as keyof typeof t.market.condition]}</Stamp>
              <Stamp tone={p.authenticityVerified ? "ok" : "neutral"}>{p.authenticityVerified ? t.market.verifiedOriginal : t.market.authenticity[p.authenticityClaim as keyof typeof t.market.authenticity]}</Stamp>
            </div>
            {p.oeNumbers.length ? <p><span className="label-mono">OE / OEM </span><Ltr>{p.oeNumbers.join(" · ")}</Ltr></p> : null}
            <Notice tone="info">{t.garage.vinNotProof}</Notice>
            <section>
              <h2 className="label-mono mb-2">{t.market.fitment.compatible_per_source} / {t.market.fitment.seller_claim}</h2>
              {p.fitments.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-ink text-start"><th className="py-1 text-start">{t.garage.make}</th><th className="text-start">{t.garage.model}</th><th className="text-start">{t.garage.year}</th><th className="text-start">{t.garage.engine}</th><th className="text-start">{t.common.source}</th></tr></thead>
                  <tbody>
                    {p.fitments.map((f, i) => (
                      <tr key={i} className="border-b border-dashed border-rule">
                        <td className="py-1.5">{f.make}</td><td>{f.model}</td><td><Ltr>{f.yearFrom}–{f.yearTo}</Ltr></td><td>{f.engine ? <Ltr>{f.engine}</Ltr> : "—"}</td>
                        <td><Stamp tone={f.source === "merchant_claim" ? "warn" : "ok"}>{srcLabel[f.source]}</Stamp></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-ink-3">{t.market.fitment.needs_confirmation}</p>}
            </section>
          </div>
        </article>
        <aside className="space-y-4">
          <div className="ticket p-5">
            <p className="font-display text-3xl font-bold">{formatMoney(p.priceMinor, p.currency as CurrencyCode, locale)}</p>
            <p className="mt-1 text-sm text-ink-2">{t.market.warranty}: <Ltr>{p.warrantyDays}</Ltr> {t.market.days} · {t.market.returns}: <Ltr>{p.returnDays}</Ltr> {t.market.days}</p>
            <p className="text-sm text-ink-2">{t.market.delivery}: {p.deliveryOptions.map((d) => (d === "pickup" ? t.market.pickup : t.market.deliveryOpt)).join("، ")}</p>
            <p className="mt-1 text-xs text-ink-3">{t.market.priceFromServer}</p>
            <div className="mt-4">{auth ? <AddToCart productId={p.id} disabled={!p.inStock} /> : <p className="text-sm">{t.common.signInToUse}</p>}</div>
          </div>
          <div className="ticket p-5 text-sm">
            <p className="label-mono">{t.market.seller}</p>
            <p className="font-semibold">{p.merchant.name}</p>
            <p className="text-ink-3">{reviews.count ? `★ ${reviews.average!.toFixed(1)} · ${reviews.count}` : t.workshops.noRating}</p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
