import Link from "next/link";
import { IQ_GOVERNORATES } from "@autocare/contracts";
import { ProductCard } from "@/components/product-card";
import { Container, Empty, PageHeader } from "@/components/ui/bits";
import { Icon } from "@/components/ui/icon";
import { getDict } from "@/i18n/server";
import { currentAuth } from "@/server/http/session";
import { searchCatalog, sponsoredForCatalog } from "@/server/modules/market/service";
import { getOwnedVehicle, listVehicles } from "@/server/modules/vehicles/service";

export const metadata = { title: "القطع" };

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ q?: string; vehicleId?: string; gov?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getDict();
  const auth = await currentAuth();
  const vehicles = auth ? await listVehicles(auth.user.id) : [];
  const v = auth && sp.vehicleId && /^[0-9a-f-]{36}$/.test(sp.vehicleId) ? await getOwnedVehicle(auth.user.id, sp.vehicleId).catch(() => null) : null;
  const gov = IQ_GOVERNORATES.some((g) => g.code === sp.gov) ? sp.gov : undefined;
  const q = (sp.q ?? "").trim().slice(0, 120) || undefined;
  const vctx = v ? { make: v.make, model: v.model, year: v.year, engine: v.engine } : undefined;
  const [items, sponsored] = await Promise.all([searchCatalog({ q, governorate: gov, limit: 36, vehicle: vctx }), sponsoredForCatalog({ q, governorate: gov, vehicle: vctx })]);

  return (
    <Container>
      <PageHeader
        title={t.market.title}
        lead={t.market.lead}
        actions={
          <>
            <Link href="/market/requests" className="btn btn-primary">{t.market.requestQuote}</Link>
            {auth ? <Link href="/cart" className="btn"><Icon name="cart" size={18} />{t.market.cart}</Link> : null}
          </>
        }
      />
      <form method="get" className="ticket mb-8 grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
        <div>
          <label htmlFor="mq" className="field-label">{t.home.submit}</label>
          <input id="mq" name="q" defaultValue={q} className="field" maxLength={120} placeholder={t.market.searchPh} />
        </div>
        <div>
          <label htmlFor="mv" className="field-label">{t.market.forVehicle}</label>
          <select id="mv" name="vehicleId" defaultValue={v?.id ?? ""} className="field">
            <option value="">—</option>
            {vehicles.map((x) => <option key={x.id} value={x.id}>{x.make} {x.model} {x.year}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mg" className="field-label">{t.market.governorate}</label>
          <select id="mg" name="gov" defaultValue={gov ?? ""} className="field">
            <option value="">{t.market.anyGov}</option>
            {IQ_GOVERNORATES.map((g) => <option key={g.code} value={g.code}>{locale === "ar" ? g.ar : g.en}</option>)}
          </select>
        </div>
        <button className="btn btn-primary">{t.home.submit}</button>
      </form>
      {sponsored.length ? (
        <section aria-labelledby="sponsored-h" className="mb-8 border-2 border-dashed border-signal p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="sponsored-h" className="label-mono text-signal">{t.billing.sponsoredBlock}</h2>
            <p className="text-xs text-ink-3">{t.billing.sponsoredNote}</p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sponsored.map((p) => <li key={p.id}><ProductCard p={{ ...p, sponsored: true }} t={t} locale={locale} vehicleId={v?.id} /></li>)}
          </ul>
        </section>
      ) : null}
      {items.length === 0 ? (
        <Empty action={<Link href="/market/requests" className="btn btn-primary">{t.market.requestQuote}</Link>}>{t.search.none}</Empty>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id}><ProductCard p={p} t={t} locale={locale} vehicleId={v?.id} /></li>
          ))}
        </ul>
      )}
    </Container>
  );
}
