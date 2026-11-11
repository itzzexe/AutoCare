"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export function AddToCart({ productId, disabled }: { productId: string; disabled: boolean }) {
  const { t } = useT();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const { pending, error, run } = useSubmit<unknown>();
  return (
    <div className="space-y-2">
      <FormError error={error} />
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="qty">{t.market.qty}</label>
        <input id="qty" type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="field w-20 text-center" dir="ltr" />
        <button type="button" className="btn btn-primary flex-1" disabled={disabled || pending} onClick={async () => { if (await run(() => api("/cart", { body: { productId, quantity: qty } }))) setAdded(true); }}>
          {disabled ? t.market.outOfStock : t.market.addToCart}
        </button>
      </div>
      {added ? <Link className="link text-sm" href="/cart">{t.market.cart} →</Link> : null}
    </div>
  );
}
