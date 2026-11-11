"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatMoney, IQ_GOVERNORATES, type CurrencyCode } from "@autocare/contracts";
import { FormError, Input, Select, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { Empty, Notice } from "@/components/ui/bits";
import { api, newIdempotencyKey } from "@/lib/api-client";

interface Line { cartItemId: string; merchantName: string; title: string; unitPriceMinor: number; deliveryFeeMinor: number; currency: string; quantity: number; available: boolean; merchantId: string }
interface Cart { lines: Line[]; totalMinor: number; currency: string | null | undefined; mixedCurrency: boolean }

interface Gateway { id: "qi_card" | "zaincash"; name: string; minAmountIqd: number }

export function CartView({ cart, emailVerified, gateways, testGateway }: { cart: Cart; emailVerified: boolean; gateways: Gateway[]; testGateway: boolean }) {
  const { t, locale } = useT();
  const router = useRouter();
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [placed, setPlaced] = useState<string | null>(null);
  // One idempotency key per checkout attempt: double clicks and retries cannot create two orders.
  const idem = useRef(newIdempotencyKey());
  const { pending, error, fields, run } = useSubmit<{ orderId: string; redirectUrl?: string | null; paymentInitFailed?: boolean }>();
  const [payInitFailed, setPayInitFailed] = useState(false);
  const remove = useSubmit<unknown>();

  if (placed)
    return (
      <div className="ticket space-y-3 p-6">
        <p className="stamp ok stamp-in text-base">{t.market.orderPlaced}</p>
        {payInitFailed ? <Notice tone="warn">{t.market.paymentInitFailed}</Notice> : null}
        <Link href="/orders" className="btn btn-primary">{t.market.orders}</Link>
      </div>
    );
  if (!cart.lines.length) return <Empty action={<Link className="btn" href="/market">{t.market.title}</Link>}>{t.market.cartEmpty}</Empty>;
  const cur = (cart.currency ?? "IQD") as CurrencyCode;
  const byMerchant = [...new Set(cart.lines.map((l) => l.merchantId))];

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <p className="label-mono">{t.market.perMerchant}</p>
        {byMerchant.map((mid) => {
          const lines = cart.lines.filter((l) => l.merchantId === mid);
          return (
            <section key={mid} className="ticket">
              <div className="ticket-head"><span>{lines[0]!.merchantName}</span><span dir="ltr">{lines.length}</span></div>
              <ul className="divide-y divide-dashed divide-rule">
                {lines.map((l) => (
                  <li key={l.cartItemId} className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <p className="font-semibold">{l.title}</p>
                      <p className="text-sm text-ink-3">{formatMoney(l.unitPriceMinor, l.currency as CurrencyCode, locale)} × {l.quantity}{l.deliveryFeeMinor ? ` + ${t.market.delivery} ${formatMoney(l.deliveryFeeMinor, l.currency as CurrencyCode, locale)}` : ""}</p>
                      {!l.available ? <p className="text-sm text-danger">{t.errors.insufficient_stock}</p> : null}
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={remove.pending} onClick={async () => { await remove.run(() => api(`/cart/${l.cartItemId}`, { method: "DELETE" })); router.refresh(); }}>{t.common.delete}</button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <form
        className="ticket space-y-4 self-start p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const s = (k: string) => String(fd.get(k) ?? "").trim();
          const body = {
            paymentMethod: s("payment"),
            fulfilment,
            address: fulfilment === "delivery" ? { governorate: s("gov"), city: s("city"), street: s("street"), landmark: s("landmark") || undefined, recipientName: s("recipient"), phone: s("phone") } : undefined,
          };
          const r = await run(() => api<{ orderId: string; redirectUrl?: string | null; paymentInitFailed?: boolean }>("/checkout", { body, headers: { "idempotency-key": idem.current } }));
          if (r?.redirectUrl && r.redirectUrl.startsWith("https://")) {
            window.location.assign(r.redirectUrl);
            return;
          }
          if (r) {
            setPayInitFailed(Boolean(r.paymentInitFailed));
            setPlaced(r.orderId);
            router.refresh();
          }
        }}
      >
        <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
          <span className="text-lg font-bold">{t.market.total}</span>
          <span className="font-display text-2xl font-bold">{formatMoney(cart.totalMinor, cur, locale)}</span>
        </div>
        <p className="text-xs text-ink-3">{t.market.priceFromServer}</p>
        {cart.mixedCurrency ? <Notice tone="warn">mixed currency</Notice> : null}
        {!emailVerified ? <Notice tone="warn">{t.market.emailRequired}</Notice> : null}
        <FormError error={error} />
        <fieldset className="space-y-2">
          <legend className="field-label">{t.market.delivery}</legend>
          <div className="flex gap-2">
            <button type="button" className="chip" aria-pressed={fulfilment === "pickup"} onClick={() => setFulfilment("pickup")}>{t.market.pickup}</button>
            <button type="button" className="chip" aria-pressed={fulfilment === "delivery"} onClick={() => setFulfilment("delivery")}>{t.market.deliveryOpt}</button>
          </div>
        </fieldset>
        {fulfilment === "delivery" ? (
          <div className="grid gap-3">
            <Select label={t.market.governorate} name="gov" defaultValue="BGD">
              {IQ_GOVERNORATES.map((g) => <option key={g.code} value={g.code}>{locale === "ar" ? g.ar : g.en}</option>)}
            </Select>
            <Input label={t.market.city} name="city" required maxLength={80} fields={fields} />
            <Input label={t.market.street} name="street" required maxLength={200} fields={fields} />
            <Input label={t.market.landmark} name="landmark" maxLength={200} fields={fields} />
            <Input label={t.market.recipient} name="recipient" required maxLength={80} autoComplete="name" fields={fields} />
            <Input label={t.market.phone} name="phone" required inputMode="tel" maxLength={20} ltr autoComplete="tel" fields={fields} />
          </div>
        ) : null}
        <fieldset className="space-y-2">
          <legend className="field-label">{t.market.paymentMethod}</legend>
          <label className="flex items-center gap-2"><input type="radio" name="payment" value="cod" defaultChecked className="accent-[var(--signal)]" /> {t.market.cod}</label>
          {gateways.filter((g) => cart.totalMinor >= g.minAmountIqd && (cart.currency ?? "IQD") === "IQD").map((g) => (
            <label key={g.id} className="flex items-center gap-2"><input type="radio" name="payment" value={g.id} className="accent-[var(--signal)]" /> {g.name}</label>
          ))}
          {testGateway ? <label className="flex items-center gap-2"><input type="radio" name="payment" value="test_gateway" className="accent-[var(--signal)]" /> {t.market.testGateway}</label> : null}
        </fieldset>
        <button className="btn btn-primary w-full" disabled={pending || !emailVerified || cart.lines.some((l) => !l.available)}>{pending ? t.common.loading : t.market.placeOrder}</button>
      </form>
    </div>
  );
}
