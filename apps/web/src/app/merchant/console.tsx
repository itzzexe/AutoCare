"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, IQ_GOVERNORATES, type CurrencyCode } from "@autocare/contracts";
import { FormError, Input, Select, Textarea, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Empty, Ltr, Stamp } from "@/components/ui/bits";
import { api } from "@/lib/api-client";

export function ApplyMerchant() {
  const { t, locale } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<unknown>();
  return (
    <form
      className="ticket space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const ok = await run(() => api("/merchant/apply", { body: { name: String(fd.get("name")), governorate: String(fd.get("gov")), city: String(fd.get("city")), phone: String(fd.get("phone")), description: String(fd.get("desc") ?? "") || undefined } }));
        if (ok) router.refresh();
      }}
    >
      <FormError error={error} />
      <Input label={locale === "ar" ? "اسم المحل" : "Shop name"} name="name" required maxLength={120} fields={fields} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={t.market.governorate} name="gov" defaultValue="BGD">
          {IQ_GOVERNORATES.map((g) => <option key={g.code} value={g.code}>{locale === "ar" ? g.ar : g.en}</option>)}
        </Select>
        <Input label={t.market.city} name="city" required maxLength={80} fields={fields} />
      </div>
      <Input label={t.market.phone} name="phone" required ltr maxLength={20} inputMode="tel" fields={fields} />
      <Textarea label={t.garage.notes} name="desc" maxLength={1000} rows={3} fields={fields} />
      <button className="btn btn-primary" disabled={pending}>{t.common.save}</button>
    </form>
  );
}

interface P { id: string; titleAr: string; brand: string; priceMinor: number; currency: string; stockQty: number; status: string; verified: boolean; sponsored: boolean }
interface Statement {
  totals: Array<{ status: string; baseMinor: number; amountMinor: number }>;
  entries: Array<{ id: string; merchantOrderId: string; baseMinor: number; rateBps: number; amountMinor: number; currency: string; status: "accrued" | "invoiced" | "settled" | "void"; createdAt: string }>;
}
interface R { id: string; vehicle: Record<string, unknown>; partDescription: string; oeNumber: string | null; quantity: number; governorate: string; expiresAt: string; myOffer: { status: string; priceMinor: number } | null }
interface O { id: string; status: string; subtotalMinor: number; deliveryFeeMinor: number; currency: string; fulfilment: string; paymentMethod: string; address: Record<string, string> | null; items: Array<{ title: string; qty: number }>; createdAt: string }

const NEXT: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["shipped", "cancelled"], shipped: ["delivered"], return_requested: ["returned", "delivered"] };

export function MerchantConsole({ products, requests, orders, statement, sponsorAllowance, commissionBps }: { products: P[]; requests: R[]; orders: O[]; statement: Statement; sponsorAllowance: number; commissionBps: number }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"orders" | "requests" | "products" | "statement">("orders");
  const sponsoredCount = products.filter((p) => p.sponsored).length;
  const s = useSubmit<unknown>();
  const go = async (fn: () => Promise<unknown>) => {
    if (await s.run(fn)) router.refresh();
  };
  const tabs = [
    { k: "orders" as const, label: `${t.market.orders} (${orders.length})` },
    { k: "requests" as const, label: `${t.market.requests} (${requests.length})` },
    { k: "products" as const, label: `${t.market.title} (${products.length})` },
    { k: "statement" as const, label: t.billing.statementTitle },
  ];
  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((x) => <button key={x.k} role="tab" aria-selected={tab === x.k} type="button" className="chip" aria-pressed={tab === x.k} onClick={() => setTab(x.k)}>{x.label}</button>)}
      </div>
      <FormError error={s.error} />

      {tab === "orders" ? (
        orders.length ? (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id} className="ticket grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex items-center gap-2"><Ltr className="text-xs">SUB-{o.id.slice(0, 8).toUpperCase()}</Ltr><Stamp tone="info">{o.status}</Stamp></div>
                  <ul className="mt-1 text-sm">{o.items.map((i, k) => <li key={k}>{i.title} × {i.qty}</li>)}</ul>
                  <p className="text-sm text-ink-3">{formatMoney(o.subtotalMinor + o.deliveryFeeMinor, o.currency as CurrencyCode, locale)} · {o.paymentMethod === "cod" ? t.market.cod : t.market.testGateway} · {o.fulfilment === "pickup" ? t.market.pickup : t.market.deliveryOpt}</p>
                  {o.address ? <p className="mt-1 text-sm">{o.address.recipientName} · <Ltr>{o.address.phone}</Ltr> · {o.address.city} — {o.address.street}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2 self-start">
                  {(NEXT[o.status] ?? []).map((n) => <button key={n} type="button" className={`btn btn-sm ${n === "cancelled" ? "text-danger" : ""}`} disabled={s.pending} onClick={() => go(() => api(`/merchant/orders/${o.id}`, { method: "PATCH", body: { status: n } }))}>{n}</button>)}
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty>{t.common.empty}</Empty>
      ) : null}

      {tab === "requests" ? (
        requests.length ? (
          <ul className="space-y-3">{requests.map((r) => <RequestRow key={r.id} r={r} onDone={() => router.refresh()} />)}</ul>
        ) : <Empty>{t.common.empty}</Empty>
      ) : null}

      {tab === "products" ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <ul className="ticket divide-y divide-dashed divide-rule self-start">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-semibold">{p.titleAr}</p>
                  <p className="text-sm text-ink-3">{p.brand} · {formatMoney(p.priceMinor, p.currency as CurrencyCode, locale)} · {t.market.qty}: <Ltr>{p.stockQty}</Ltr></p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.verified ? <Stamp tone="ok">{t.market.verifiedOriginal}</Stamp> : <Stamp tone="neutral">{p.status}</Stamp>}
                  {p.sponsored ? <Stamp tone="warn">{t.market.sponsored}</Stamp> : null}
                  {sponsorAllowance > 0 && (p.sponsored || sponsoredCount < sponsorAllowance) ? (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={s.pending} onClick={() => go(() => api(`/merchant/products/${p.id}/sponsored`, { method: "PUT", body: { sponsored: !p.sponsored } }))}>
                      {p.sponsored ? t.billing.unsponsor : t.billing.sponsor}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {!products.length ? <li className="p-4 text-ink-3">{t.common.empty}</li> : null}
          </ul>
          <ProductForm onDone={() => router.refresh()} />
        </div>
      ) : null}

      {tab === "statement" ? (
        <section className="space-y-4">
          <p className="text-sm text-ink-2">{t.billing.statementLead} <Ltr>{(commissionBps / 100).toFixed(2)}%</Ltr></p>
          <dl className="grid gap-3 sm:grid-cols-4">
            {statement.totals.map((x) => (
              <div key={x.status} className="ticket p-4">
                <dt className="label-mono">{t.billing.commissionStatus[x.status as keyof typeof t.billing.commissionStatus] ?? x.status}</dt>
                <dd className="font-display text-xl font-bold">{formatMoney(x.amountMinor, "IQD", locale)}</dd>
              </div>
            ))}
          </dl>
          {statement.entries.length ? (
            <div className="ticket overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-ink-3"><tr><th className="p-3 text-start">{t.common.date}</th><th className="p-3 text-start">#</th><th className="p-3 text-start">{t.billing.base}</th><th className="p-3 text-start">{t.billing.rate}</th><th className="p-3 text-start">{t.billing.amount}</th><th className="p-3 text-start">{t.common.status}</th></tr></thead>
                <tbody className="divide-y divide-dashed divide-rule">
                  {statement.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="p-3">{new Date(e.createdAt).toLocaleDateString(locale === "ar" ? "ar-IQ" : "en-GB")}</td>
                      <td className="p-3"><Ltr className="text-xs">SUB-{e.merchantOrderId.slice(0, 8).toUpperCase()}</Ltr></td>
                      <td className="p-3">{formatMoney(e.baseMinor, e.currency as CurrencyCode, locale)}</td>
                      <td className="p-3"><Ltr>{(e.rateBps / 100).toFixed(2)}%</Ltr></td>
                      <td className="p-3 font-semibold">{formatMoney(e.amountMinor, e.currency as CurrencyCode, locale)}</td>
                      <td className="p-3"><Stamp tone={e.status === "void" ? "neutral" : e.status === "settled" ? "ok" : "warn"}>{t.billing.commissionStatus[e.status]}</Stamp></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>{t.common.empty}</Empty>}
          <a href="/account/billing?plan=merchant_pro" className="btn btn-sm">{t.billing.upgrade}</a>
        </section>
      ) : null}
    </div>
  );
}

function RequestRow({ r, onDone }: { r: R; onDone: () => void }) {
  const { t, locale } = useT();
  const s = useSubmit<unknown>();
  const [open, setOpen] = useState(false);
  return (
    <li className="ticket p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{r.partDescription} × {r.quantity}</p>
          <p className="text-sm text-ink-3">{String(r.vehicle.make)} {String(r.vehicle.model)} {String(r.vehicle.year)} {r.vehicle.engine ? <Ltr>{String(r.vehicle.engine)}</Ltr> : null}{r.oeNumber ? <> · OE <Ltr>{r.oeNumber}</Ltr></> : null}</p>
        </div>
        {r.myOffer ? <Stamp tone="ok">{formatMoney(r.myOffer.priceMinor, "IQD", locale)} · {r.myOffer.status}</Stamp> : <button type="button" className="btn btn-sm" onClick={() => setOpen(!open)}>{t.market.offers}</button>}
      </div>
      {open && !r.myOffer ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const ok = await s.run(() => api(`/merchant/requests/${r.id}/offers`, { body: { priceMinor: Number(fd.get("price")), currency: "IQD", condition: String(fd.get("cond")), warrantyDays: Number(fd.get("warranty")), deliveryFeeMinor: Number(fd.get("fee") || 0), etaDays: Number(fd.get("eta")), notes: String(fd.get("notes") ?? "") || undefined } }));
            if (ok) onDone();
          }}
        >
          <div className="sm:col-span-4"><FormError error={s.error} /></div>
          <Input label={`${t.market.total} (${t.common.iqd})`} name="price" type="number" min={0} required ltr fields={s.fields} />
          <Input label={`${t.market.delivery} (${t.common.iqd})`} name="fee" type="number" min={0} defaultValue={0} ltr fields={s.fields} />
          <Input label={`${t.market.warranty} (${t.market.days})`} name="warranty" type="number" min={0} defaultValue={0} required ltr fields={s.fields} />
          <Input label={`${t.market.eta} (${t.market.days})`} name="eta" type="number" min={0} defaultValue={1} required ltr fields={s.fields} />
          <Select label={t.common.status} name="cond" defaultValue="new">
            {(["new", "used", "refurbished"] as const).map((c) => <option key={c} value={c}>{t.market.condition[c]}</option>)}
          </Select>
          <div className="sm:col-span-2"><Input label={t.garage.notes} name="notes" maxLength={500} fields={s.fields} /></div>
          <div className="self-end"><button className="btn btn-primary w-full" disabled={s.pending}>{t.common.save}</button></div>
        </form>
      ) : null}
    </li>
  );
}

function ProductForm({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const s = useSubmit<unknown>();
  return (
    <form
      className="ticket space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const g = (k: string) => String(fd.get(k) ?? "").trim();
        const fit = g("fitMake") && g("fitModel") ? [{ make: g("fitMake"), model: g("fitModel"), yearFrom: Number(g("fitFrom") || 2000), yearTo: Number(g("fitTo") || 2030) }] : [];
        const ok = await s.run(() =>
          api("/merchant/products", {
            body: {
              titleAr: g("title"), brand: g("brand"), category: g("category"), oeNumbers: g("oe") ? g("oe").split(/[,\s]+/).filter(Boolean) : [],
              condition: g("cond"), authenticityClaim: g("auth"), priceMinor: Number(g("price")), currency: "IQD", stockQty: Number(g("stock")),
              warrantyDays: Number(g("warranty") || 0), returnDays: Number(g("returns") || 0), deliveryOptions: ["pickup", ...(fd.get("delivery") ? ["delivery" as const] : [])], imageIds: [], fitments: fit,
            },
          }),
        );
        if (ok) {
          form.reset();
          onDone();
        }
      }}
    >
      <p className="text-lg font-bold">+ {t.market.title}</p>
      <FormError error={s.error} />
      <Input label={t.market.partDescription} name="title" required maxLength={160} fields={s.fields} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Brand" name="brand" required maxLength={80} fields={s.fields} />
        <Input label="Category" name="category" required maxLength={80} fields={s.fields} />
      </div>
      <Input label="OE / OEM" name="oe" ltr maxLength={300} fields={s.fields} />
      <div className="grid grid-cols-2 gap-3">
        <Select label={t.common.status} name="cond" defaultValue="new">{(["new", "used", "refurbished"] as const).map((c) => <option key={c} value={c}>{t.market.condition[c]}</option>)}</Select>
        <Select label={t.market.verifiedOriginal} name="auth" defaultValue="aftermarket">{(["oem_genuine", "oem_equivalent", "aftermarket", "unknown"] as const).map((c) => <option key={c} value={c}>{t.market.authenticity[c]}</option>)}</Select>
        <Input label={`${t.market.total} (${t.common.iqd})`} name="price" type="number" min={0} required ltr fields={s.fields} />
        <Input label={t.market.qty} name="stock" type="number" min={0} required ltr fields={s.fields} />
        <Input label={`${t.market.warranty} (${t.market.days})`} name="warranty" type="number" min={0} ltr fields={s.fields} />
        <Input label={`${t.market.returns} (${t.market.days})`} name="returns" type="number" min={0} ltr fields={s.fields} />
      </div>
      <fieldset className="grid grid-cols-2 gap-3 border-t border-dashed border-rule pt-3">
        <legend className="label-mono">{t.market.fitment.seller_claim}</legend>
        <Input label={t.garage.make} name="fitMake" maxLength={60} fields={s.fields} />
        <Input label={t.garage.model} name="fitModel" maxLength={80} fields={s.fields} />
        <Input label={`${t.garage.year} ←`} name="fitFrom" type="number" ltr fields={s.fields} />
        <Input label={`${t.garage.year} →`} name="fitTo" type="number" ltr fields={s.fields} />
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="delivery" className="accent-[var(--signal)]" /> {t.market.deliveryOpt}</label>
      <button className="btn btn-primary" disabled={s.pending}>{t.common.save}</button>
    </form>
  );
}
