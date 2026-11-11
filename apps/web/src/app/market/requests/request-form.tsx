"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IQ_GOVERNORATES } from "@autocare/contracts";
import { FormError, Input, Select, useSubmit } from "@/components/form";
import { useT } from "@/components/i18n";
import { api } from "@/lib/api-client";

export function RequestForm({ vehicles }: { vehicles: Array<{ id: string; label: string }> }) {
  const { t, locale } = useT();
  const router = useRouter();
  const { pending, error, fields, run } = useSubmit<unknown>();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const ok = await run(() => api("/offer-requests", { body: { vehicleId: String(fd.get("vehicleId")), partDescription: String(fd.get("part")), oeNumber: String(fd.get("oe") ?? "") || undefined, quantity: Number(fd.get("qty")), governorate: String(fd.get("gov")) } }));
        if (ok) {
          form.reset();
          router.refresh();
        }
      }}
    >
      <FormError error={error} />
      <Select label={t.diagnose.chooseVehicle} name="vehicleId" fields={fields}>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </Select>
      <Input label={t.market.partDescription} name="part" required maxLength={300} placeholder="مثال: دينمو مستعمل بحالة جيدة" fields={fields} />
      <Input label={t.market.oe} name="oe" maxLength={40} ltr fields={fields} />
      <div className="grid grid-cols-2 gap-3">
        <Input label={t.market.qty} name="qty" type="number" min={1} max={20} defaultValue={1} required ltr fields={fields} />
        <Select label={t.market.governorate} name="gov" defaultValue="BGD">
          {IQ_GOVERNORATES.map((g) => <option key={g.code} value={g.code}>{locale === "ar" ? g.ar : g.en}</option>)}
        </Select>
      </div>
      <button className="btn btn-primary w-full" disabled={pending}>{t.market.requestQuote}</button>
    </form>
  );
}

export function AddOfferToCart({ offerId }: { offerId: string }) {
  const { t } = useT();
  const { pending, run } = useSubmit<unknown>();
  const [done, setDone] = useState(false);
  return done ? (
    <Link href="/cart" className="link text-xs">{t.market.cart} →</Link>
  ) : (
    <button type="button" className="btn btn-sm" disabled={pending} onClick={async () => { if (await run(() => api("/cart", { body: { offerId, quantity: 1 } }))) setDone(true); }}>
      {t.market.addToCart}
    </button>
  );
}
